// frontend/static/js/modules/api.js
// @FileDescription: API 接口封装


const BASE = '/api';

// 基础数据接口
export const API = {
    // 基础数据
    getPois: (cat) => fetch(`${BASE}/pois?category=${cat}`).then(r => r.json()),
    getRoads: (type) => fetch(`${BASE}/roads?type=${type}`).then(r => r.json()),
    getLayer: (name) => fetch(`${BASE}/${name}`).then(r => r.json()),

    // 分类管理
    checkMissing: () => fetch(`${BASE}/classification/missing`).then(r => r.json()),
    updateClass: (data) => fetch(`${BASE}/classification/update`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
    }),

    // 空间分析
    analyzeService: (data) => fetch(`${BASE}/analyze/service_area`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
    }).then(r => r.json()),

    analyzeBlind: (data) => fetch(`${BASE}/analyze/blind_spot`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
    }).then(r => r.json()),

    analyzePlaceBuffer: (data) => fetch(`${BASE}/analyze/place_buffer`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
    }).then(r => r.json()),

    getPlaceStats: (data) => fetch(`${BASE}/stats/places_completeness`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
    }).then(r => r.json()),

    // 编辑 (CRUD)
    addFeature: (data) => fetch(`${BASE}/feature/add`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
    }).then(r => r.json()),

    updateFeature: (data) => fetch(`${BASE}/feature/update`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
    }).then(r => r.json()),

    // 数据管理
    resetData: () => fetch(`${BASE}/data/reset`, { method: 'POST' }).then(r => r.json()),
    uploadData: (formData) => fetch(`${BASE}/data/upload`, { method: 'POST', body: formData }).then(r => r.json())
};