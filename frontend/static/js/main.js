// frontend/static/js/main.js
// @FileDescription: 主入口文件：负责初始化、绑定事件、挂载全局函数

import { initMap } from './map.js';
import { state } from './modules/state.js';
import { API } from './modules/api.js';

import * as LayerMgr from './modules/layerManager.js';
import * as Analysis from './modules/analysis.js';
import * as Editor from './modules/editor.js';
import * as Exporter from './modules/exporter.js';
import * as UI from './modules/ui.js';

// 1. 初始化地图
const map = initMap();
state.map = map;
state.drawLayer = new L.FeatureGroup().addTo(map);

// 2. 绑定全局点击事件 (清除选择)
map.on('click', (e) => LayerMgr.clearSelection());
const listContainer = document.getElementById('poiListContainer');
if(listContainer) {
    listContainer.addEventListener('click', (e) => {
        if (e.target === listContainer) LayerMgr.clearSelection();
    });
}

// 3. 挂载全局函数 (供 HTML onclick 调用)
window.toggleCategory = LayerMgr.toggleCategory;
window.handleDelete = LayerMgr.handleDelete;
window.toggleLayer = LayerMgr.toggleLayer;

window.activateBoxSelect = Analysis.activateBoxSelect;
window.runNetworkAnalysis = Analysis.runNetworkAnalysis;
window.startBlindSpotDraw = Analysis.startBlindSpotDraw;
window.activatePlaceSelect = Analysis.activatePlaceSelect;
window.clearAllAnalysis = Analysis.clearAllAnalysis;

window.setEditMode = Editor.setEditMode;
window.openAddModal = Editor.openAddModal;
window.closeLayerModal = Editor.closeLayerModal;
window.startDrawNew = Editor.startDrawNew;
window.closeFormModal = Editor.closeFormModal;
window.submitFeatureForm = Editor.submitFeatureForm;
window.redrawGeometry = Editor.redrawGeometry;
window.openFeatureForm = Editor.openFeatureForm;

window.exportMapImage = Exporter.exportMapImage;
window.showPoiStats = Exporter.showPoiStats;
window.showPlaceStats = Exporter.showPlaceStats;
window.exportCurrentChartData = Exporter.exportCurrentChartData;

// UI 模块挂载
window.toggleSidebar = UI.toggleSidebar;
window.openUploadModal = UI.openUploadModal;
window.closeUploadModal = UI.closeUploadModal;
window.submitUpload = UI.submitUpload;
window.resetToDefaultData = UI.resetToDefaultData;
window.confirmClassification = UI.confirmClassification; // 👈 这里的引用修正了

// 4. 初始化路网监听器
LayerMgr.initRoadListeners();

// 5. 启动时检查分类 (调用 UI 模块的方法)
UI.checkMissingClassifications();

console.log("System Initialized (Fixed).");