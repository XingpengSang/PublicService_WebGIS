// frontend/static/js/modules/ui.js
// @FileDescription: UI界面交互模块：侧边栏、上传/重置、缺失分类检查


// frontend/static/js/modules/ui.js
import { startProcess, endProcess } from './processMgr.js'; 
import { state } from './state.js';
import { API } from './api.js';
import { clearAllAnalysis } from './analysis.js';

// --- 侧边栏折叠 ---
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

// --- 数据上传/重置模态框 ---
export function openUploadModal() { 
    document.getElementById('uploadModal').style.display='flex'; 
    document.getElementById('uploadStatus').innerText=""; 
}

// 关闭上传模态框
export function closeUploadModal() { 
    document.getElementById('uploadModal').style.display='none'; 
}

// 重置前端状态 (内部工具函数)
function resetFrontendState() {
    if(state.map) {
        Object.keys(state.layers).forEach(k=>state.map.removeLayer(state.layers[k]));
        Object.keys(state.roadLayers).forEach(k=>state.map.removeLayer(state.roadLayers[k]));
        state.analysisLayers.forEach(l => state.map.removeLayer(l));
        if(state.userPoiSelection) state.map.removeLayer(state.userPoiSelection);
    }
    state.drawLayer.clearLayers();
    clearAllAnalysis();
    
    // 重置数据
    state.pois={}; state.layers={}; state.roadLayers={}; state.analysisLayers=[]; 
    state.deletedIds=[]; state.selectedIds=new Set(); state.placeAnalyses={};
    state.missingQueue=[]; // 清空缺失队列

    document.querySelectorAll('input[type="checkbox"]').forEach(cb=>cb.checked=false);
    document.getElementById('poiListContainer').innerHTML='<div style="text-align:center;padding:10px">已重置，请重新勾选</div>';
}

// 提交上传
export async function submitUpload() {
    const statusDiv = document.getElementById('uploadStatus'); 
    closeUploadModal();
    const signal = startProcess("正在上传并解析 GeoJSON 数据，文件较大请耐心等待...");
    const fd = new FormData();
    ['pois','roads','places','buildings','classification'].forEach(k => {
        const f = document.getElementById('file_'+(k==='classification'?'class':k)).files[0];
        if(f) fd.append(k, f);
    });
    try {
        const res = await API.uploadData(fd, signal);
        if(res.status==='success') {
            statusDiv.innerText="成功!"; 
            resetFrontendState(); 
            setTimeout(()=>{
                alert("数据已更新，请重新勾选图层查看。");
                checkMissingClassifications(); // 重新检查
            },500);
        } else {
            alert("上传失败: " + res.message);
            // 如果失败，重新打开模态框显示错误
            openUploadModal();
            document.getElementById('uploadStatus').innerText = "失败: " + res.message;
            document.getElementById('uploadStatus').style.color = "red";
        }
    } catch(e) { 
        if (e.name !== 'AbortError') {
            console.error(e);
            alert("上传出错: " + e.message);
            openUploadModal();
        } 
    } finally {
        endProcess();
    }
}

// 恢复默认
export async function resetToDefaultData() {
    if(!confirm("确定恢复默认示例数据吗？")) return;
    closeUploadModal();
    const signal = startProcess("正在从服务器重新加载默认数据，这可能需要几秒钟, 请耐心等待...");
    
    try { 
        await API.resetData(signal); 
        resetFrontendState();
        alert("已恢复默认数据"); 
        checkMissingClassifications(); // 重新检查
    } catch(e){ 
        if (e.name !== 'AbortError') alert("重置失败"); 
    } finally { 
        endProcess(); 
    }
}

// --- 缺失分类检查逻辑 ---

export async function checkMissingClassifications() {
    try {
        const missing = await API.checkMissing();
        if (missing && missing.length > 0) {
            state.missingQueue = missing;
            showMissingModal();
        }
    } catch (e) { console.error("Check missing failed", e); }
}

function showMissingModal() {
    if (state.missingQueue.length === 0) {
        document.getElementById('missingClassModal').style.display = 'none';
        return;
    }
    const currentFclass = state.missingQueue[0];
    document.getElementById('missingClassModal').style.display = 'flex';
    document.getElementById('currentMissingItem').innerHTML = `
        <strong>fclass: </strong> <span style="color:red; font-size:18px;">${currentFclass}</span>
    `;
}

export async function confirmClassification() {
    const fclass = state.missingQueue[0];
    const category = document.getElementById('missingSelect').value;

    try {
        await API.updateClass({ fclass: fclass, category: category });
        state.missingQueue.shift();
        showMissingModal();
    } catch (e) { alert("更新分类失败"); }
}
