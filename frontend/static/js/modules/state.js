// frontend/static/js/modules/state.js
// @FileDescription: 全局状态变量 & 颜色配置

// 全局状态变量
export const state = {
    map: null,          // Leaflet 地图实例
    
    // 数据缓存
    pois: {},           // { '教育': geojson, ... }
    layers: {},         // 存储基础图层 (places, buildings, pois)
    roadLayers: {},     // 存储路网图层
    
    // 状态标记
    deletedIds: [],     // 已删除要素 ID
    
    // 交互选择状态
    selectedIds: new Set(), // 当前选中的 POI ID 集合
    lastClickedId: null,    // Shift 多选辅助
    currentVisibleIds: [],  // 当前列表显示的 ID 顺序
    
    // 分析相关
    drawControl: null,
    drawLayer: null,    // 绘图层
    analysisLayers: [], // 分析结果图层列表
    lastServiceGeoJSON: null, // 服务区缓存
    userPoiSelection: null,   // 框选范围
    placeAnalyses: {},  // 居民点分析缓存 { id: {layer, info} }
    
    // 编辑器状态
    editMode: {
        mode: 'none',   // none, info, add, edit
        targetLayerType: null,
        editingFeatureId: null,
        editingFeatureGeom: null,
        tempDrawLayer: null
    },

    // 其他
    missingQueue: []    // 缺失分类队列
};

// 颜色配置
export const colors = {
    road: { 
        'motorway': '#d946ef', 'trunk': '#f97316', 'primary': '#eab308', 
        'secondary': '#3b82f6', 'residential': '#8b5cf6', 'other': '#9ca3af' 
    },
    category: { 
        '教育': '#3b82f6', '医疗': '#15f911', '文娱': '#ec4899', 
        '商业': '#f59e0b', '其他': '#6b7280' 
    }
};