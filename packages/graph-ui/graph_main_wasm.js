/* @ts-self-types="./graph_main_wasm.d.ts" */

export class RenderEngine {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RenderEngineFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_renderengine_free(ptr, 0);
    }
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        const ret = wasm.renderengine_create(canvas);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        RenderEngineFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Debug: return current dim tween state so the host can confirm spotlight
     * is reaching the GPU. Returned object has { progress, target, start,
     * dimOpacity, selectedIdx, dimmedCount }. Cheap — used only by tests and
     * ad-hoc DevTools probes, not the render path.
     * @returns {any}
     */
    debug_focus_state() {
        const ret = wasm.renderengine_debug_focus_state(this.__wbg_ptr);
        return ret;
    }
    /**
     * Return (and clear) pending worker messages queued by drag handlers.
     * The React wrapper calls this after each drag event and forwards the
     * results via `worker.postMessage`.
     * @returns {any}
     */
    drain_worker_messages() {
        const ret = wasm.renderengine_drain_worker_messages(this.__wbg_ptr);
        return ret;
    }
    /**
     * Compute the AABB of current node positions and snap the camera to it.
     * Called from JS after every `update_positions` + layout settlement.
     * NOTE: this is a snap (immediate write), not animated — only `focus_fit`
     * uses the animated camera tween.
     * @param {number} padding_px
     */
    fit(padding_px) {
        wasm.renderengine_fit(this.__wbg_ptr, padding_px);
    }
    /**
     * Focus a node AND animate the camera to frame its 1-hop neighborhood over 400 ms.
     * When `id` is `None`, clears focus and animates to fit all nodes.
     * @param {string | null | undefined} id
     * @param {number} padding_px
     */
    focus_fit(id, padding_px) {
        var ptr0 = isLikeNone(id) ? 0 : passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.renderengine_focus_fit(this.__wbg_ptr, ptr0, len0, padding_px);
    }
    /**
     * @param {number} timestamp
     * @returns {boolean}
     */
    frame(timestamp) {
        const ret = wasm.renderengine_frame(this.__wbg_ptr, timestamp);
        return ret !== 0;
    }
    /**
     * @returns {any}
     */
    get_legend() {
        const ret = wasm.renderengine_get_legend(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} screen_x
     * @param {number} screen_y
     * @returns {string | undefined}
     */
    handle_click(screen_x, screen_y) {
        const ret = wasm.renderengine_handle_click(this.__wbg_ptr, screen_x, screen_y);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {number} screen_x
     * @param {number} screen_y
     * @returns {string | undefined}
     */
    handle_hover(screen_x, screen_y) {
        const ret = wasm.renderengine_handle_hover(this.__wbg_ptr, screen_x, screen_y);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * End the current drag. Queues an unpin message so the force layout reclaims
     * the node.
     */
    handle_node_drag_end() {
        wasm.renderengine_handle_node_drag_end(this.__wbg_ptr);
    }
    /**
     * Update the currently-dragged node's position. No-op if no drag active.
     * @param {number} screen_x
     * @param {number} screen_y
     */
    handle_node_drag_move(screen_x, screen_y) {
        wasm.renderengine_handle_node_drag_move(this.__wbg_ptr, screen_x, screen_y);
    }
    /**
     * Start dragging the node at the given screen coordinates.
     * Returns the node id if a node was picked, otherwise None (caller should
     * fall back to pan).
     * @param {number} screen_x
     * @param {number} screen_y
     * @returns {string | undefined}
     */
    handle_node_drag_start(screen_x, screen_y) {
        const ret = wasm.renderengine_handle_node_drag_start(this.__wbg_ptr, screen_x, screen_y);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    handle_pan_end() {
        wasm.renderengine_handle_pan_end(this.__wbg_ptr);
    }
    /**
     * @param {number} x
     * @param {number} y
     */
    handle_pan_move(x, y) {
        wasm.renderengine_handle_pan_move(this.__wbg_ptr, x, y);
    }
    /**
     * @param {number} x
     * @param {number} y
     */
    handle_pan_start(x, y) {
        wasm.renderengine_handle_pan_start(this.__wbg_ptr, x, y);
    }
    /**
     * @param {number} delta
     * @param {number} _x
     * @param {number} _y
     */
    handle_zoom(delta, _x, _y) {
        wasm.renderengine_handle_zoom(this.__wbg_ptr, delta, _x, _y);
    }
    /**
     * @returns {boolean}
     */
    needs_frame() {
        const ret = wasm.renderengine_needs_frame(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Re-upload GPU buffers after a WebGL context loss → restore sequence.
     */
    rehydrate() {
        wasm.renderengine_rehydrate(this.__wbg_ptr);
    }
    request_render() {
        wasm.renderengine_request_render(this.__wbg_ptr);
    }
    /**
     * @param {boolean} show
     */
    set_community_hulls(show) {
        wasm.renderengine_set_community_hulls(this.__wbg_ptr, show);
    }
    /**
     * @param {any} ids_js
     * @param {any} types_js
     */
    set_edge_metadata(ids_js, types_js) {
        const ret = wasm.renderengine_set_edge_metadata(this.__wbg_ptr, ids_js, types_js);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Focus a node: dim every non-neighbor via `visual_flags` (bit 0 = dimmed).
     * `None` clears the focus.
     *
     * NOTE on data layout: the plan spec assumed `edge_data` stride-4 with
     * `[source_idx, target_idx, ...]`, but the actual worker layout is stride-6
     * `[sx, sy, tx, ty, type_idx, weight]` in world coordinates (see
     * `graph-worker-wasm::engine::get_edge_buffer`). We therefore resolve
     * source/target node indices by matching edge endpoint coordinates to
     * `self.positions`. This is semantically equivalent — the coordinates came
     * from the same `positions` map — and avoids a worker-side schema change.
     *
     * NOTE on coordinate keying: we key the position→index map by
     * `(x.to_bits(), y.to_bits())` rather than rounded integers. f32 values
     * transit through the worker boundary bit-identical — Float32Array
     * preserves exact bits — so bit-for-bit matching is correct and
     * collision-free. Rounded-integer keys would silently collide for any
     * two nodes whose positions round to the same integer pair (realistic
     * at sub-pixel separation during layout convergence), dropping one of
     * them from the lookup. Bit keys only collide when two nodes occupy the
     * exact same f32 position — a genuine overlap, not an aliasing artifact.
     *
     * NOTE on `visual_flags` semantics: the existing renderer treats the whole
     * byte as `== 1` for "dimmed" (see `rebuild_buffers` ~line 584). Since we
     * only use bit 0 here (values end up 0 or 1), this matches the renderer's
     * current check. If additional bits are ever added to `visual_flags`, the
     * renderer's `== 1` comparison must be upgraded to a `& 1` bit test.
     * @param {string | null} [id]
     */
    set_focus(id) {
        var ptr0 = isLikeNone(id) ? 0 : passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.renderengine_set_focus(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {string[]} ids
     */
    set_node_ids(ids) {
        const ptr0 = passArrayJsValueToWasm0(ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.renderengine_set_node_ids(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {any} ids_js
     * @param {any} types_js
     * @param {any} statuses_js
     */
    set_node_metadata(ids_js, types_js, statuses_js) {
        const ret = wasm.renderengine_set_node_metadata(this.__wbg_ptr, ids_js, types_js, statuses_js);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {any} theme_js
     */
    set_theme(theme_js) {
        const ret = wasm.renderengine_set_theme(this.__wbg_ptr, theme_js);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Subscribe to edge-data updates (for the Canvas2D EdgeLabelsOverlay).
     * Callback invoked each frame with `{edgeData: Float32Array, focusIdx: number}`.
     * Returns a subscriber index that can be passed to `unsubscribe_edges` for cleanup.
     * @param {Function} cb
     * @returns {number}
     */
    subscribe_edges(cb) {
        const ret = wasm.renderengine_subscribe_edges(this.__wbg_ptr, cb);
        return ret >>> 0;
    }
    /**
     * Subscribe to per-frame position+camera updates (for the Canvas2D label overlay).
     * Callback invoked once per `frame()` tick with `{positions: Float32Array, vpMatrix: Float32Array}`.
     * @param {Function} cb
     */
    subscribe_frame(cb) {
        wasm.renderengine_subscribe_frame(this.__wbg_ptr, cb);
    }
    /**
     * Unsubscribe a previously-registered edge subscriber by its index.
     * @param {number} idx
     */
    unsubscribe_edges(idx) {
        wasm.renderengine_unsubscribe_edges(this.__wbg_ptr, idx);
    }
    /**
     * @param {Float32Array} edge_data
     * @param {number} edge_count
     */
    update_edges(edge_data, edge_count) {
        const ptr0 = passArrayF32ToWasm0(edge_data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.renderengine_update_edges(this.__wbg_ptr, ptr0, len0, edge_count);
    }
    /**
     * @param {Float32Array} positions
     * @param {Uint8Array} flags
     */
    update_positions(positions, flags) {
        const ptr0 = passArrayF32ToWasm0(positions, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(flags, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.renderengine_update_positions(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    /**
     * Multiplicative zoom around screen center.
     */
    zoom_in() {
        wasm.renderengine_zoom_in(this.__wbg_ptr);
    }
    zoom_out() {
        wasm.renderengine_zoom_out(this.__wbg_ptr);
    }
}
if (Symbol.dispose) RenderEngine.prototype[Symbol.dispose] = RenderEngine.prototype.free;

export function init() {
    wasm.init();
}

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_2e59b1b37a9a34c3: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_Number_e6ffdb596c888833: function(arg0) {
            const ret = Number(arg0);
            return ret;
        },
        __wbg_String_8564e559799eccda: function(arg0, arg1) {
            const ret = String(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_boolean_get_a86c216575a75c30: function(arg0) {
            const v = arg0;
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_dd5d2d07ce9e6c57: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_in_4bd7a57e54337366: function(arg0, arg1) {
            const ret = arg0 in arg1;
            return ret;
        },
        __wbg___wbindgen_is_function_49868bde5eb1e745: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_object_40c5a80572e8f9d3: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_b29b5c5a8065ba1a: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_c0cca72b82b86f4d: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_jsval_loose_eq_3a72ae764d46d944: function(arg0, arg1) {
            const ret = arg0 == arg1;
            return ret;
        },
        __wbg___wbindgen_number_get_7579aab02a8a620c: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_914df97fcfa788f2: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_81fc77679af83bc6: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_activeTexture_55755e76627be758: function(arg0, arg1) {
            arg0.activeTexture(arg1 >>> 0);
        },
        __wbg_attachShader_91626cdf6ee920b8: function(arg0, arg1, arg2) {
            arg0.attachShader(arg1, arg2);
        },
        __wbg_bindBuffer_ec76634c95f563c2: function(arg0, arg1, arg2) {
            arg0.bindBuffer(arg1 >>> 0, arg2);
        },
        __wbg_bindTexture_3f1c468809dfc331: function(arg0, arg1, arg2) {
            arg0.bindTexture(arg1 >>> 0, arg2);
        },
        __wbg_bindVertexArray_ef65b171588388e0: function(arg0, arg1) {
            arg0.bindVertexArray(arg1);
        },
        __wbg_blendFunc_9ec46725800dafb1: function(arg0, arg1, arg2) {
            arg0.blendFunc(arg1 >>> 0, arg2 >>> 0);
        },
        __wbg_bufferData_74194b1c2d90193e: function(arg0, arg1, arg2, arg3) {
            arg0.bufferData(arg1 >>> 0, arg2, arg3 >>> 0);
        },
        __wbg_call_7f2987183bb62793: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_call_d578befcc3145dee: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_clearColor_4c23ac0feeb06fb4: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.clearColor(arg1, arg2, arg3, arg4);
        },
        __wbg_clear_98a9ca84e00ae8e2: function(arg0, arg1) {
            arg0.clear(arg1 >>> 0);
        },
        __wbg_clientHeight_5b2f0183d7cb8934: function(arg0) {
            const ret = arg0.clientHeight;
            return ret;
        },
        __wbg_clientWidth_c1c9f96f9f5da276: function(arg0) {
            const ret = arg0.clientWidth;
            return ret;
        },
        __wbg_compileShader_30b1185156c62e3a: function(arg0, arg1) {
            arg0.compileShader(arg1);
        },
        __wbg_createBuffer_bdda716ebf68ba59: function(arg0) {
            const ret = arg0.createBuffer();
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_createProgram_ba013605ddf3824a: function(arg0) {
            const ret = arg0.createProgram();
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_createShader_b2c5333fcc05114e: function(arg0, arg1) {
            const ret = arg0.createShader(arg1 >>> 0);
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_createTexture_ab0a6dde87005cb1: function(arg0) {
            const ret = arg0.createTexture();
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_createVertexArray_be0c22725872a475: function(arg0) {
            const ret = arg0.createVertexArray();
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_debug_50e24f25b064ded1: function(arg0) {
            console.debug(arg0);
        },
        __wbg_deleteShader_0784961238f3ba6f: function(arg0, arg1) {
            arg0.deleteShader(arg1);
        },
        __wbg_devicePixelRatio_a0dc790882837272: function(arg0) {
            const ret = arg0.devicePixelRatio;
            return ret;
        },
        __wbg_done_547d467e97529006: function(arg0) {
            const ret = arg0.done;
            return ret;
        },
        __wbg_drawArraysInstanced_f8a4998461298b8d: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.drawArraysInstanced(arg1 >>> 0, arg2, arg3, arg4);
        },
        __wbg_drawArrays_079aad920afe1404: function(arg0, arg1, arg2, arg3) {
            arg0.drawArrays(arg1 >>> 0, arg2, arg3);
        },
        __wbg_enableVertexAttribArray_b4abeab358174fdb: function(arg0, arg1) {
            arg0.enableVertexAttribArray(arg1 >>> 0);
        },
        __wbg_enable_9328f475236428ef: function(arg0, arg1) {
            arg0.enable(arg1 >>> 0);
        },
        __wbg_entries_616b1a459b85be0b: function(arg0) {
            const ret = Object.entries(arg0);
            return ret;
        },
        __wbg_error_38bec0a78dd8ded8: function(arg0) {
            console.error(arg0);
        },
        __wbg_getContext_8f1ff363618c55da: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.getContext(getStringFromWasm0(arg1, arg2));
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        }, arguments); },
        __wbg_getProgramInfoLog_b2d112da8cb8c5c5: function(arg0, arg1, arg2) {
            const ret = arg1.getProgramInfoLog(arg2);
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_getProgramParameter_2b7693f9edfde93d: function(arg0, arg1, arg2) {
            const ret = arg0.getProgramParameter(arg1, arg2 >>> 0);
            return ret;
        },
        __wbg_getShaderInfoLog_57aaac3110ec22f3: function(arg0, arg1, arg2) {
            const ret = arg1.getShaderInfoLog(arg2);
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_getShaderParameter_2b6f35d96d51cc82: function(arg0, arg1, arg2) {
            const ret = arg0.getShaderParameter(arg1, arg2 >>> 0);
            return ret;
        },
        __wbg_getUniformLocation_8d93a5f3de4232bf: function(arg0, arg1, arg2, arg3) {
            const ret = arg0.getUniformLocation(arg1, getStringFromWasm0(arg2, arg3));
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_get_4848e350b40afc16: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_ed0642c4b9d31ddf: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_unchecked_7d7babe32e9e6a54: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_with_ref_key_6412cf3094599694: function(arg0, arg1) {
            const ret = arg0[arg1];
            return ret;
        },
        __wbg_height_734034c3ff2654af: function(arg0) {
            const ret = arg0.height;
            return ret;
        },
        __wbg_info_4e3339024d0fb613: function(arg0) {
            console.info(arg0);
        },
        __wbg_instanceof_ArrayBuffer_ff7c1337a5e3b33a: function(arg0) {
            let result;
            try {
                result = arg0 instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint8Array_4b8da683deb25d72: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Uint8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_WebGl2RenderingContext_6502f76e53996a5e: function(arg0) {
            let result;
            try {
                result = arg0 instanceof WebGL2RenderingContext;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Window_c0fee4c064502536: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Window;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isArray_db61795ad004c139: function(arg0) {
            const ret = Array.isArray(arg0);
            return ret;
        },
        __wbg_isSafeInteger_ea83862ba994770c: function(arg0) {
            const ret = Number.isSafeInteger(arg0);
            return ret;
        },
        __wbg_iterator_de403ef31815a3e6: function() {
            const ret = Symbol.iterator;
            return ret;
        },
        __wbg_length_0c32cb8543c8e4c8: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_6e821edde497a532: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_linkProgram_d86c69f8f86f3031: function(arg0, arg1) {
            arg0.linkProgram(arg1);
        },
        __wbg_log_4c0baeb8af2f8f89: function(arg0) {
            console.log(arg0);
        },
        __wbg_new_4f9fafbb3909af72: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_99cabae501c0a8a0: function() {
            const ret = new Map();
            return ret;
        },
        __wbg_new_a560378ea1240b14: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_new_f3c9df4f38f3f798: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_with_length_26bffbe236bf73f9: function(arg0) {
            const ret = new Float32Array(arg0 >>> 0);
            return ret;
        },
        __wbg_next_01132ed6134b8ef5: function(arg0) {
            const ret = arg0.next;
            return ret;
        },
        __wbg_next_b3713ec761a9dbfd: function() { return handleError(function (arg0) {
            const ret = arg0.next();
            return ret;
        }, arguments); },
        __wbg_now_2c44418ca0623664: function(arg0) {
            const ret = arg0.now();
            return ret;
        },
        __wbg_now_88621c9c9a4f3ffc: function() {
            const ret = Date.now();
            return ret;
        },
        __wbg_performance_5ed3f6a3bbe36d0d: function(arg0) {
            const ret = arg0.performance;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_prototypesetcall_3e05eb9545565046: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_set_08463b1df38a7e29: function(arg0, arg1, arg2) {
            const ret = arg0.set(arg1, arg2);
            return ret;
        },
        __wbg_set_6be42768c690e380: function(arg0, arg1, arg2) {
            arg0[arg1] = arg2;
        },
        __wbg_set_6c60b2e8ad0e9383: function(arg0, arg1, arg2) {
            arg0[arg1 >>> 0] = arg2;
        },
        __wbg_set_8ee2d34facb8466e: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_set_height_26ab95ff99e2b620: function(arg0, arg1) {
            arg0.height = arg1 >>> 0;
        },
        __wbg_set_width_81fa781e87b17891: function(arg0, arg1) {
            arg0.width = arg1 >>> 0;
        },
        __wbg_shaderSource_cae157a332281ae7: function(arg0, arg1, arg2, arg3) {
            arg0.shaderSource(arg1, getStringFromWasm0(arg2, arg3));
        },
        __wbg_static_accessor_GLOBAL_THIS_a1248013d790bf5f: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_f2e0f995a21329ff: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_24f78b6d23f286ea: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_59fd959c540fe405: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_texImage2D_6a3521456a5f13ec: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10) {
            arg0.texImage2D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7 >>> 0, arg8 >>> 0, arg9 === 0 ? undefined : getArrayU8FromWasm0(arg9, arg10));
        }, arguments); },
        __wbg_texParameteri_51f89620521fe4f5: function(arg0, arg1, arg2, arg3) {
            arg0.texParameteri(arg1 >>> 0, arg2 >>> 0, arg3);
        },
        __wbg_uniform1f_fc8bddcb58797aec: function(arg0, arg1, arg2) {
            arg0.uniform1f(arg1, arg2);
        },
        __wbg_uniform1i_acce06d190ce18d5: function(arg0, arg1, arg2) {
            arg0.uniform1i(arg1, arg2);
        },
        __wbg_uniformMatrix4fv_5395d1840e1704d7: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.uniformMatrix4fv(arg1, arg2 !== 0, getArrayF32FromWasm0(arg3, arg4));
        },
        __wbg_useProgram_f79c775d2e8824a9: function(arg0, arg1) {
            arg0.useProgram(arg1);
        },
        __wbg_value_7f6052747ccf940f: function(arg0) {
            const ret = arg0.value;
            return ret;
        },
        __wbg_vertexAttribDivisor_01d7e6446210d446: function(arg0, arg1, arg2) {
            arg0.vertexAttribDivisor(arg1 >>> 0, arg2 >>> 0);
        },
        __wbg_vertexAttribPointer_7db76295987fda72: function(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
            arg0.vertexAttribPointer(arg1 >>> 0, arg2, arg3 >>> 0, arg4 !== 0, arg5, arg6);
        },
        __wbg_viewport_de5bbf3f5c97bfcf: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.viewport(arg1, arg2, arg3, arg4);
        },
        __wbg_warn_2b0a27f629a4bb1e: function(arg0) {
            console.warn(arg0);
        },
        __wbg_width_80cea93fc7f63070: function(arg0) {
            const ret = arg0.width;
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0) {
            // Cast intrinsic for `I64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(F32)) -> NamedExternref("Float32Array")`.
            const ret = getArrayF32FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000005: function(arg0) {
            // Cast intrinsic for `U64 -> Externref`.
            const ret = BigInt.asUintN(64, arg0);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./graph_main_wasm_bg.js": import0,
    };
}

const RenderEngineFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_renderengine_free(ptr >>> 0, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayJsValueToWasm0(array, malloc) {
    const ptr = malloc(array.length * 4, 4) >>> 0;
    for (let i = 0; i < array.length; i++) {
        const add = addToExternrefTable0(array[i]);
        getDataViewMemory0().setUint32(ptr + 4 * i, add, true);
    }
    WASM_VECTOR_LEN = array.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedFloat32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('graph_main_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
