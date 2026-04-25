import { useMemo, useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, MessageSquare, GitBranch, Plug, Plus, Search, ChevronDown } from "lucide-react";
import { useAuth } from "react-oidc-context";
import { ThreadGroup } from "./ThreadGroup";
import { useUIStore } from "@/stores/ui";
import { useChatThreads, type ChatThread } from "@/hooks/useChatThreads";
import { useChatStore } from "@/stores/chat";
import { useCreateThread } from "@/hooks/useChatMutations";

function bucketThreads(threads: ChatThread[]) {
  const out = {
    today: [] as ChatThread[],
    yesterday: [] as ChatThread[],
    lastWeek: [] as ChatThread[],
    lastMonth: [] as ChatThread[],
    older: [] as ChatThread[],
  };
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const sevenDaysAgo = now - 7 * 86_400_000;
  const thirtyDaysAgo = now - 30 * 86_400_000;
  for (const t of threads) {
    const ts = new Date(t.updated_at).getTime();
    if (ts >= startOfToday.getTime()) out.today.push(t);
    else if (ts >= startOfYesterday.getTime()) out.yesterday.push(t);
    else if (ts >= sevenDaysAgo) out.lastWeek.push(t);
    else if (ts >= thirtyDaysAgo) out.lastMonth.push(t);
    else out.older.push(t);
  }
  return out;
}

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const initial = auth.user?.profile?.name?.[0]?.toUpperCase() ?? "U";
  const userName = auth.user?.profile?.name ?? auth.user?.profile?.email ?? "Account";

  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const openModal = useUIStore((s) => s.openModal);
  const activeId = useChatStore((s) => s.activeThreadId);
  const setActiveId = useChatStore((s) => s.setActiveThreadId);

  const { data: threads, isLoading } = useChatThreads();
  const createThread = useCreateThread();
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    if (!threads) return [];
    if (!searchQuery.trim()) return threads;
    const q = searchQuery.toLowerCase();
    return threads.filter((t) => (t.title ?? "").toLowerCase().includes(q));
  }, [threads, searchQuery]);

  const buckets = useMemo(() => bucketThreads(filtered), [filtered]);

  const onSelectThread = (id: string) => {
    setActiveId(id);
    navigate("/chat");
    if (window.innerWidth < 768) toggleSidebar();
  };

  const onNewChat = async () => {
    const created = await createThread.mutateAsync(undefined);
    setActiveId(created.id);
    navigate("/chat");
    if (window.innerWidth < 768) toggleSidebar();
  };

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && window.innerWidth < 768) toggleSidebar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen, toggleSidebar]);

  if (!sidebarOpen) return null;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-logo" aria-label="Substrate">S</span>
        <button
          type="button"
          className="sidebar-collapse"
          onClick={toggleSidebar}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      <div className="sidebar-actions">
        <button
          type="button"
          className="sidebar-new-chat"
          onClick={() => { void onNewChat(); }}
          disabled={createThread.isPending}
        >
          <Plus size={14} /> New chat
        </button>
        <div className="sidebar-search">
          <Search size={12} />
          <input
            type="search"
            placeholder="Search threads…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <ul className="sidebar-nav">
        <li>
          <button
            type="button"
            className={`sidebar-nav-link${location.pathname.startsWith("/chat") ? " is-active" : ""}`}
            onClick={() => navigate("/chat")}
          >
            <MessageSquare size={14} /> Chat
          </button>
        </li>
        <li>
          <button
            type="button"
            className={`sidebar-nav-link${location.pathname.startsWith("/graph") ? " is-active" : ""}`}
            onClick={() => navigate("/graph")}
          >
            <GitBranch size={14} /> Graph
          </button>
        </li>
        <li>
          <button
            type="button"
            className={`sidebar-nav-link${location.pathname.startsWith("/sources") ? " is-active" : ""}`}
            onClick={() => navigate("/sources")}
          >
            <Plug size={14} /> Sources
          </button>
        </li>
      </ul>

      <nav className="sidebar-threads" aria-label="Chat threads">
        {isLoading && <div className="muted sidebar-threads-loading">Loading…</div>}
        <ThreadGroup label="Today" threads={buckets.today} activeId={activeId} onSelect={onSelectThread} />
        <ThreadGroup label="Yesterday" threads={buckets.yesterday} activeId={activeId} onSelect={onSelectThread} />
        <ThreadGroup label="Last 7 days" threads={buckets.lastWeek} activeId={activeId} onSelect={onSelectThread} />
        <ThreadGroup label="Last 30 days" threads={buckets.lastMonth} activeId={activeId} onSelect={onSelectThread} />
        <ThreadGroup label="Older" threads={buckets.older} activeId={activeId} onSelect={onSelectThread} />
        {filtered.length === 0 && !isLoading && (
          <p className="muted sidebar-threads-empty">No threads.</p>
        )}
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-account"
          onClick={() => openModal("settings")}
          title="Account & settings"
        >
          <span className="sidebar-account-avatar">{initial}</span>
          <span className="sidebar-account-name">{userName}</span>
          <ChevronDown size={12} />
        </button>
      </div>
    </aside>
  );
}
