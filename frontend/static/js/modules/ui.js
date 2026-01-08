// frontend/static/js/modules/ui.js
// @FileDescription: UI界面交互模块：侧边栏、上传/重置、缺失分类检查


import { state } from './state.js';
import { API } from './api.js';
import { clearAllAnalysis } from './analysis.js';

// 切换侧边栏显示/隐藏
export function toggleSidebar() {
    const sidebar = document.getElementById('mainSidebar');
    const icon = document.getElementById('sidebarToggleIcon');
    sidebar.classList.toggle('collapsed');
    if (sidebar.classList.contains('collapsed')) {
        icon.className = 'fa-solid fa-chevron-right'; icon.parentElement.title = "展开";
    } else {
        icon.className = 'fa-solid fa-chevron-left'; icon.parentElement.title = "折叠";
    }
}

// 打开/关闭上传数据模态框
export function openUploadModal() { document.getElementById('uploadModal').style.display='flex'; document.getElementById('uploadStatus').innerText=""; }
export function closeUploadModal() { document.getElementById('uploadModal').style.display='none'; }

// 重置前端状态
function resetFrontendState() {
    Object.keys(state.layers).forEach(k=>state.map.removeLayer(state.layers[k]));
    Object.keys(state.roadLayers).forEach(k=>state.map.removeLayer(state.roadLayers[k]));
    clearAllAnalysis();
    state.pois={}; state.layers={}; state.roadLayers={}; state.deletedIds=[]; state.selectedIds=new Set(); state.placeAnalyses={};
    document.querySelectorAll('input[type="checkbox"]').forEach(cb=>cb.checked=false);
    document.getElementById('poiListContainer').innerHTML='<div style="text-align:center;padding:10px">已重置</div>';
}

// 提交上传数据
export async function submitUpload() {
    const statusDiv = document.getElementById('uploadStatus'); statusDiv.innerText="上传中...";
    const fd = new FormData();
    ['pois','roads','places','buildings','classification'].forEach(k => {
        const f = document.getElementById('file_'+(k==='classification'?'class':k)).files[0];
        if(f) fd.append(k, f);
    });
    try {
        const res = await API.uploadData(fd);
        if(res.status==='success') {
            statusDiv.innerText="成功!"; resetFrontendState(); setTimeout(()=>{closeUploadModal(); alert("数据已更新");},500);
        } else statusDiv.innerText="失败";
    } catch(e) { statusDiv.innerText="错误"; }
}

// 重置为默认数据
export async function resetToDefaultData() {
    if(!confirm("恢复默认?")) return;
    try { await API.resetData(); resetFrontendState(); closeUploadModal(); alert("已恢复"); } catch(e){}
}