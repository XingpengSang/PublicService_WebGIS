// frontend/static/js/modules/api.js
// @FileDescription: API 接口封装


const BASE = '/api';

// 基础数据接口
export const API = {
    // 基础数据
    getPois: (cat, signal) => fetch(`${BASE}/pois?category=${cat}`, {signal}).then(r => r.json()),
    getRoads: (type, signal) => fetch(`${BASE}/roads?type=${type}`, {signal}).then(r => r.json()),
    getLayer: (name, signal) => fetch(`${BASE}/${name}`, {signal}).then(r => r.json()),

    // 分类管理
    checkMissing: () => fetch(`${BASE}/classification/missing`).then(r => r.json()),
    updateClass: (data, signal) => fetch(`${BASE}/classification/update`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data),
        signal: signal // 绑定信号
    }),

    // 空间分析
    analyzeService: (data, signal) => fetch(`${BASE}/analyze/service_area`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data),
        signal: signal // 绑定信号
    }).then(r => r.json()),

    analyzeBlind: (data, signal) => fetch(`${BASE}/analyze/blind_spot`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data),
        signal: signal // 绑定信号
    }).then(r => r.json()),

    analyzePlaceBuffer: (data, signal) => fetch(`${BASE}/analyze/place_buffer`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data),
        signal: signal // 绑定信号
    }).then(r => r.json()),

    getPlaceStats: (data, signal) => fetch(`${BASE}/stats/places_completeness`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data),
        signal: signal // 绑定信号
    }).then(r => r.json()),

    // 编辑功能
    addFeature: (data) => fetch(`${BASE}/feature/add`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
    }).then(r => r.json()),

    updateFeature: (data) => fetch(`${BASE}/feature/update`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
    }).then(r => r.json()),

    // 数据管理(上传/重置)
    resetData: (signal) => fetch(`${BASE}/data/reset`, { 
        method: 'POST', signal: signal  // 绑定信号
    }).then(r => r.json()),

    uploadData: (formData, signal) => fetch(`${BASE}/data/upload`, { 
        method: 'POST', body: formData, signal: signal  // 绑定信号
    }).then(r => r.json())
};