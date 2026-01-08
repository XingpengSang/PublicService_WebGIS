// frontend/static/js/modules/processMgr.js
// @FileDescription: 任务进程管理：启动、结束、终止等

import { state } from './state.js';

/**
 * @description 开启一个可取消的任务，显示遮罩层并返回一个 AbortSignal 供 API 调用
 * @param {string} message - 遮罩层显示的信息
 * @returns {AbortSignal} - 可用于 fetch 的 signal 对象
 */
export function startProcess(message = "正在处理中...") {
    const overlay = document.getElementById('process-overlay');
    const msgEl = document.getElementById('process-msg');
    
    // 防御性检查：确保 HTML 元素存在
    if (overlay && msgEl) {
        msgEl.innerText = message;
        overlay.style.display = 'flex';
    }
    
    if (state.abortController) state.abortController.abort();
    state.abortController = new AbortController();
    return state.abortController.signal;
}

/**
 * @description 结束当前任务，隐藏遮罩层
 * @returns {void}
 */
export function endProcess() {
    const overlay = document.getElementById('process-overlay');
    if (overlay) overlay.style.display = 'none';
    state.abortController = null;
}

/**
 * @description 终止当前任务（如果有），隐藏遮罩层
 * @returns {void}
 */
export function terminateCurrentProcess() {
    if (state.abortController) {
        state.abortController.abort();
        state.abortController = null;
        alert("已由用户终止操作。");
    }
    const overlay = document.getElementById('process-overlay');
    if (overlay) overlay.style.display = 'none';
}
