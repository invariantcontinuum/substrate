import structlog
from dataclasses import dataclass

logger = structlog.get_logger()


@dataclass
class Chunk:
    content: str
    start_line: int
    end_line: int
    token_count: int
    chunk_index: int


def estimate_tokens(text: str) -> int:
    return max(1, int(len(text.split()) * 1.3))


def chunk_file(content: str, chunk_size: int = 512, overlap: int = 64) -> list[Chunk]:
    input_size = len(content)
    lines = content.split("\n")
    chunks: list[Chunk] = []
    current_lines: list[str] = []
    current_tokens = 0
    start_line = 1
    chunk_index = 0

    for i, line in enumerate(lines, start=1):
        line_tokens = estimate_tokens(line)
        current_lines.append(line)
        current_tokens += line_tokens

        if current_tokens >= chunk_size:
            chunks.append(Chunk(
                content="\n".join(current_lines),
                start_line=start_line, end_line=i,
                token_count=current_tokens, chunk_index=chunk_index,
            ))
            chunk_index += 1

            overlap_lines: list[str] = []
            overlap_tokens = 0
            for prev_line in reversed(current_lines):
                lt = estimate_tokens(prev_line)
                if overlap_tokens + lt > overlap:
                    break
                overlap_lines.insert(0, prev_line)
                overlap_tokens += lt

            current_lines = overlap_lines
            current_tokens = overlap_tokens
            start_line = i - len(overlap_lines) + 1

    if current_lines:
        chunk_content = "\n".join(current_lines)
        if chunk_content.strip():
            chunks.append(Chunk(
                content=chunk_content, start_line=start_line, end_line=len(lines),
                token_count=current_tokens, chunk_index=chunk_index,
            ))
    logger.debug("file_chunked", input_bytes=input_size, chunks_produced=len(chunks))
    return chunks


def file_summary_text(file_path: str, file_type: str, language: str, content: str, max_lines: int = 100) -> str:
    preview = "\n".join(content.split("\n")[:max_lines])
    return f"path: {file_path}\ntype: {file_type}\nlanguage: {language}\n\n{preview}"
