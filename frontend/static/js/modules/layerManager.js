// frontend/static/js/modules/layerManager.js
// @FileDescription: 图层管理模块：图层控制(POI/路网/基础)、列表渲染、高亮选择逻辑


import { state, colors } from './state.js';
import { API } from './api.js';

// --- POI 图层 ---
export async function toggleCategory(cat) {
    const cb = document.getElementById(`cb_${cat}`);
    if (cb.checked) {
        if (!state.pois[cat]) state.pois[cat] = await API.getPois(cat);
        renderPoiLayer(cat);
    } else {
        if (state.layers[cat]) { state.map.removeLayer(state.layers[cat]); delete state.layers[cat]; }
        if (state.pois[cat]) state.pois[cat].features.forEach(f => state.selectedIds.delete(f.properties.osm_id));
    }
    updatePoiListUI();
}

// 渲染 POI 图层
export function renderPoiLayer(cat) {
    if (state.layers[cat]) state.map.removeLayer(state.layers[cat]);
    const data = state.pois[cat];
    // 地图上只显示“未删除”的点
    const active = state.pois[cat].features.filter(f => !state.deletedIds.includes(f.properties.osm_id));

    state.layers[cat] = L.geoJSON({type: "FeatureCollection", features: active}, {
        pointToLayer: (f, ll) => {
            const id = f.properties.osm_id;
            const isSelected = state.selectedIds.has(id);
            return L.circleMarker(ll, { 
                radius: isSelected ? 9 : 5, 
                fillColor: isSelected ? '#facc15' : (colors.category[cat] || '#333'), 
                color: isSelected ? '#000' : "#fff", 
                weight: isSelected ? 2 : 1, 
                fillOpacity: isSelected ? 1 : 0.9 
            });
        },
        onEachFeature: (feature, layer) => {
            layer.bindPopup(`<b>${feature.properties.name || "未命名"}</b><br>Fclass: ${feature.properties.fclass}`);
            // 点击拦截 (用于编辑模式)
            layer.on('click', (e) => {
                if (state.editMode.mode === 'info' || state.editMode.mode === 'edit') {
                    if (e.originalEvent) { e.originalEvent.stopPropagation(); e.originalEvent.preventDefault(); }
                    window.openFeatureForm(feature, 'pois'); 
                }
            });
            // 👇👇👇 新增：双击地图点 -> 定位列表 👇👇👇
            layer.on('dblclick', (e) => {
                // 1. 阻止地图默认的双击缩放行为
                L.DomEvent.stopPropagation(e); 
                
                // 2. 执行定位逻辑
                locateListItem(feature.properties.osm_id);
            });
            // 👆👆👆 新增结束 👆👆👆
        }
    }).addTo(state.map);

    if (state.layers[cat]) state.layers[cat].bringToFront();
}

// 刷新 POI 列表 UI
export function updatePoiListUI() {
    const container = document.getElementById('poiListContainer');
    container.innerHTML = "";
    let idx = 1; let hasData = false;
    state.currentVisibleIds = []; 

    ['教育', '医疗', '文娱', '商业', '其他'].forEach(cat => {
        const cb = document.getElementById(`cb_${cat}`);
        if (state.pois[cat] && cb && cb.checked) {
            hasData = true;
            state.pois[cat].features.forEach(f => {
                const id = f.properties.osm_id;
                
                // 👇 1. 判断当前是否在删除列表中
                const isDel = state.deletedIds.includes(id); 
                
                state.currentVisibleIds.push(id); // 依然计入可见列表(供Shift多选)，或者你可以决定是否排除
                
                const isSel = state.selectedIds.has(id);
                const displayId = String(id).length > 8 ? '...'+String(id).slice(-6) : id;
                
                const row = document.createElement('div');
                // 👇👇👇 新增：给每一行绑定唯一的 DOM ID (格式: poi-item-osm_id)
                row.id = `poi-item-${id}`;
                // 👇 2. 加上 deleted 类名用于变灰/删除线
                row.className = `poi-row ${isSel?'selected':''} ${isDel?'deleted':''}`;
                
                // 👇 3. 动态生成按钮逻辑
                // 参数 ${isDel}：如果是 true，点击后执行恢复；如果是 false，执行删除
                // 文本：isDel ? '恢复' : '删除'
                row.innerHTML = `
                    <div class="poi-cell">${idx++}</div>
                    <div class="poi-cell" title="${id}">${displayId}</div>
                    <div class="poi-cell"><span class="badge">${f.properties.fclass}</span></div>
                    <div class="poi-cell" title="${f.properties.name}">${f.properties.name||'-'}</div>
                    <div class="poi-cell">
                        <button class="btn-xs ${isDel?'btn-restore':'btn-del'}" 
                                onclick="event.stopPropagation(); handleDelete('${cat}','${id}', ${isDel})">
                            ${isDel ? '恢复' : '删除'}
                        </button>
                    </div>
                `;
                
                row.onclick = (e) => { e.stopPropagation(); handleRowClick(e, id); };
                container.appendChild(row);
            });
        }
    });
    if (!hasData) container.innerHTML = '<div style="text-align:center; padding:10px; color:#999;">暂无数据</div>';
}

// 处理列表行点击
function handleRowClick(e, id) {
    if (e.shiftKey && state.lastClickedId) {
        const lastIdx = state.currentVisibleIds.indexOf(state.lastClickedId);
        const currIdx = state.currentVisibleIds.indexOf(id);
        if (lastIdx !== -1 && currIdx !== -1) {
            const start = Math.min(lastIdx, currIdx);
            const end = Math.max(lastIdx, currIdx);
            for (let i = start; i <= end; i++) { state.selectedIds.add(state.currentVisibleIds[i]); }
        }
    } else if (e.ctrlKey || e.metaKey) {
        if (state.selectedIds.has(id)) { state.selectedIds.delete(id); state.lastClickedId = null; } 
        else { state.selectedIds.add(id); state.lastClickedId = id; }
    } else {
        state.selectedIds.clear(); state.selectedIds.add(id); state.lastClickedId = id;
    }
    updatePoiListUI();
    refreshMapHighlights();
}

// 刷新地图高亮显示
export function refreshMapHighlights() {
    ['教育', '医疗', '文娱', '商业', '其他'].forEach(cat => {
        const cb = document.getElementById(`cb_${cat}`);
        if (cb && cb.checked && state.pois[cat]) renderPoiLayer(cat);
    });
}

// 删除处理
export function handleDelete(cat, id, isDel) {
    if (isDel) state.deletedIds = state.deletedIds.filter(x => x != id);
    else { state.deletedIds.push(id); state.selectedIds.delete(id); }
    renderPoiLayer(cat); updatePoiListUI();
}

// 清除选择
export function clearSelection() {
    if (state.selectedIds.size === 0) return;
    state.selectedIds.clear();
    state.lastClickedId = null;
    updatePoiListUI();
    refreshMapHighlights();
}

// --- 基础图层 (Buildings/Places) ---
export async function toggleLayer(name) {
    const cb = document.getElementById(`cb_${name}`);
    if (cb.checked) {
        const data = await API.getLayer(name);
        let style = name==='buildings'?{color:'#666',weight:1}:{radius:5,fillColor:'#8b5cf6',color:'#fff',weight:1, fillOpacity:1};
        
        state.layers[name] = L.geoJSON(data, { 
            style: style, 
            pointToLayer: name==='places'?(f,l)=>L.circleMarker(l,style):null,
            onEachFeature: (f, l) => {
                if(name==='places') l.bindTooltip(f.properties.name, {direction:'top', offset:[0,-5]});
                else l.bindPopup(f.properties.name);
                
                l.on('click', (e) => {
                    if (state.editMode.mode === 'info' || state.editMode.mode === 'edit') {
                        if (e.originalEvent) { e.originalEvent.stopPropagation(); e.originalEvent.preventDefault(); }
                        window.openFeatureForm(f, name); 
                        return;
                    }
                });
            }
        }).addTo(state.map);
    } else { 
        if(state.layers[name]) { state.map.removeLayer(state.layers[name]); delete state.layers[name]; }
        if(name==='places') { Object.values(state.placeAnalyses).forEach(x=>state.map.removeLayer(x.layer)); state.placeAnalyses={}; }
    }
}

// --- 路网图层 ---
export function initRoadListeners() {
    document.querySelectorAll('.road-checkbox').forEach(cb => {
        cb.addEventListener('change', async (e) => {
            const type = e.target.value;
            if (e.target.checked) {
                const data = await API.getRoads(type);
                const w = (type==='other'||type==='residential')?1:3;
                state.roadLayers[type] = L.geoJSON(data, { 
                    style: { color: colors.road[type] || '#333', weight: w, opacity: 0.7 },
                    onEachFeature: (feature, layer) => {
                        layer.bindPopup(`<b>${feature.properties.name || "未命名"}</b><br>${feature.properties.fclass}`);
                        layer.on('click', (e) => {
                            if (state.editMode.mode === 'info' || state.editMode.mode === 'edit') {
                                if (e.originalEvent) { e.originalEvent.stopPropagation(); e.originalEvent.preventDefault(); }
                                window.openFeatureForm(feature, 'roads');
                            }
                        });
                    }
                }).addTo(state.map);
            } else {
                if (state.roadLayers[type]) { state.map.removeLayer(state.roadLayers[type]); delete state.roadLayers[type]; }
            }
        });
    });
}

// 👇👇👇 新增：定位列表项并高亮 👇👇👇
export function locateListItem(id) {
    // 1. 确保切换到“数据管理” Tab (调用 index.html 里定义的全局 switchTab)
    if (window.switchTab) {
        window.switchTab('data');
    }

    // 2. 找到对应的 DOM 元素
    const element = document.getElementById(`poi-item-${id}`);
    
    if (element) {
        // 3. 滚动到可视区域 (平滑滚动，且尽量居中)
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // 4. 添加闪烁动画类
        // 先移除(如果已有)，强制重绘后再添加，确保动画能重复触发
        element.classList.remove('flash-active');
        void element.offsetWidth; // 强制浏览器重绘 (Magic Trick)
        element.classList.add('flash-active');
        
        // 5. (可选) 同时在逻辑上选中该行 (高亮地图点)
        // 如果你希望双击不仅定位列表，还顺便把点变成黄色选中态，可以解开下面注释
        // if (!state.selectedIds.has(id)) {
        //     // 模拟点击事件逻辑
        //     state.selectedIds.clear();
        //     state.selectedIds.add(id);
        //     state.lastClickedId = id;
        //     updatePoiListUI(); // 注意：这会重绘列表，可能导致上面的动画被打断，所以根据需求取舍
        //     // 如果启用了这行，上面的 classList 操作可能需要放在 updatePoiListUI 之后的回调里
        // }
    } else {
        console.warn(`未在列表中找到 ID: ${id}，可能是因为该类型未勾选或已过滤。`);
        alert("未在列表中找到该点，请确认左侧是否勾选了对应的设施类型。");
    }
}