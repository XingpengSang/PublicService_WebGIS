// frontend/static/js/main_backup.js
// 主入口脚本备份文件 (main.js + ./modules/*.js 的合集)


import { initMap } from './map.js';

const map = initMap();

const state = {
    pois: {},           // { '教育': geojson, ... }
    deletedIds: [],     
    layers: {},         
    roadLayers: {},
    
    // 分析相关状态
    drawControl: null,
    drawLayer: new L.FeatureGroup().addTo(map), // 统一的绘图层
    analysisLayers: [], // 存储所有分析结果图层(用于一键清除)
    
    // 服务区分析缓存
    lastServiceGeoJSON: null, // 存储上一次服务区的几何，用于盲区计算
    userPoiSelection: null,   // 用户框选的范围 (bbox layer)

    placeAnalyses: {},  // 居民点分析结果缓存 { place_id: result, ... }
    
    missingQueue: [],    

    // 交互选择状态
    selectedIds: new Set(), // 存储当前选中的 POI ID
    lastClickedId: null,    // 用于 Shift 多选，记录上一次点击的 ID
    currentVisibleIds: []   // 记录当前列表里显示的 ID 顺序，用于计算 Shift 范围
};

// 清除选中状态的通用函数
function clearSelection() {
    if (state.selectedIds.size === 0) return; // 如果本来就没选中，啥也不做
    
    state.selectedIds.clear();
    state.lastClickedId = null;
    
    // 刷新 UI 和 地图
    updatePoiListUI();
    refreshMapHighlights();
}

// 点击地图空白处 -> 取消选择
map.on('click', function(e) {
    // 如果点击的是地图底图（而不是某个覆盖物），清除选择
    // Leaflet 的 map click 事件通常是指点击了背景
    clearSelection();
});

// 点击列表空白处 -> 取消选择
const listContainer = document.getElementById('poiListContainer');
listContainer.addEventListener('click', function(e) {
    // 只有直接点击 container (空白处) 时才清除
    // 如果点击的是 row，row 的 onclick 会阻止冒泡 (见下面修改)
    if (e.target === listContainer) {
        clearSelection();
    }
});

// ==========================================
// 1. 初始化与 POI 管理 (保持不变)
// ==========================================

async function checkMissingClassifications() {
    try {
        const res = await fetch('/api/classification/missing');
        const list = await res.json();
        if (list && list.length > 0) { state.missingQueue = list; showMissingModal(); }
    } catch (e) {}
}

function showMissingModal() {
    if (state.missingQueue.length === 0) {
        document.getElementById('missingClassModal').style.display = 'none'; return;
    }
    document.getElementById('missingClassModal').style.display = 'flex';
    document.getElementById('currentMissingItem').innerHTML = `<strong>fclass: </strong> <span style="color:red; font-size:18px;">${state.missingQueue[0]}</span>`;
}

window.confirmClassification = async function() {
    try {
        await fetch('/api/classification/update', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ fclass: state.missingQueue[0], category: document.getElementById('missingSelect').value })
        });
        state.missingQueue.shift(); showMissingModal();
    } catch (e) {}
};
checkMissingClassifications();

const categoryColors = { '教育': '#3b82f6', '医疗': '#15f911', '文娱': '#ec4899', '商业': '#f59e0b', '其他': '#6b7280' };

window.toggleCategory = async function(cat) {
    const cb = document.getElementById(`cb_${cat}`);
    if (cb.checked) {
        if (!state.pois[cat]) {
            const res = await fetch(`/api/pois?category=${cat}`);
            state.pois[cat] = await res.json();
        }
        renderPoiLayer(cat);
    } else {
        if (state.layers[cat]) { map.removeLayer(state.layers[cat]); delete state.layers[cat]; }
        // 移除该类别的选中状态
        if (state.pois[cat]) {
            state.pois[cat].features.forEach(f => state.selectedIds.delete(f.properties.osm_id));
        }
    }
    updatePoiListUI();
};

function renderPoiLayer(cat) {
    if (state.layers[cat]) map.removeLayer(state.layers[cat]);
    const data = state.pois[cat];
    const active = data.features.filter(f => !state.deletedIds.includes(f.properties.osm_id));
    
    state.layers[cat] = L.geoJSON({type: "FeatureCollection", features: active}, {
        pointToLayer: (f, ll) => {
            const id = f.properties.osm_id;
            // 判断是否被选中，改变样式
            const isSelected = state.selectedIds.has(id);
            
            return L.circleMarker(ll, { 
                // 选中：半径变大(8)，黄色填充，黑色边框
                // 未选：半径正常(5)，类别颜色，白色边框
                radius: isSelected ? 9 : 5, 
                fillColor: isSelected ? '#facc15' : (categoryColors[cat] || '#333'), // 选中变黄 
                color: isSelected ? '#000' : "#fff", 
                weight: isSelected ? 2 : 1, 
                fillOpacity: isSelected ? 1 : 0.9 
            });
        },
        // onEachFeature: (f, l) => l.bindPopup(`<b>${f.properties.name||"null"}</b><br>${f.properties.fclass}`)
        onEachFeature: (feature, layer) => {
            // 原有 popup
            layer.bindPopup(`<b>${feature.properties.name || "未命名"}</b><br>Fclass: ${feature.properties.fclass}`);
            
            // 点击拦截
            layer.on('click', (e) => {
                // 如果处于 Info 或 Edit 模式
                if (editState.mode === 'info' || editState.mode === 'edit') {
                    // 阻止冒泡，防止 Popup 打开，也防止触发高亮选择逻辑
                    if (e.originalEvent) {
                        e.originalEvent.stopPropagation();
                        e.originalEvent.preventDefault();
                    }
                    
                    // 打开属性编辑框
                    // 注意：后端需要 layerType 是 'pois'
                    openFeatureForm(feature, 'pois'); 
                }
            });
        }
    }).addTo(map);

    // 选中的点置顶显示
    if (state.layers[cat]) state.layers[cat].bringToFront();
}

function updatePoiListUI() {
    const container = document.getElementById('poiListContainer');
    container.innerHTML = "";
    let idx = 1; let hasData = false;
    state.currentVisibleIds = []; // 清空当前视图 ID 列表
    ['教育', '医疗', '文娱', '商业', '其他'].forEach(cat => {
        const cb = document.getElementById(`cb_${cat}`);
        if (state.pois[cat] && cb && cb.checked) {
            hasData = true;
            state.pois[cat].features.forEach(f => {
                const id = f.properties.osm_id;
                
                // 跳过已删除
                if (state.deletedIds.includes(id)) return;
                
                // 记录显示顺序，供 Shift 多选使用
                state.currentVisibleIds.push(id);

                const isDel = false; // 已过滤掉删除的，所以这里肯定是显示的
                const isSelected = state.selectedIds.has(id);
                
                const displayId = String(id).length > 8 ? '...'+String(id).slice(-6) : id;
                const row = document.createElement('div');
                
                // 增加 selected 类名
                row.className = `poi-row ${isSelected ? 'selected' : ''}`;
                
                row.innerHTML = `<div class="poi-cell">${idx++}</div><div class="poi-cell" title="${id}">${displayId}</div><div class="poi-cell"><span class="badge">${f.properties.fclass}</span></div><div class="poi-cell" title="${f.properties.name}">${f.properties.name||'-'}</div><div class="poi-cell"><button class="btn-xs btn-del" onclick="event.stopPropagation(); handleDelete('${cat}','${id}',false)">X</button></div>`;
                
                // 绑定行点击事件
                row.onclick = (e) => {
                    // 🛑 阻止事件冒泡！防止触发 listContainer 的清除逻辑
                    e.stopPropagation(); 
                    handleRowClick(e, id);
                };

                container.appendChild(row);
            });
        }
    });
    if (!hasData) container.innerHTML = '<div style="text-align:center; padding:10px; color:#999;">暂无数据</div>';
}

// 处理行点击 (Ctrl / Shift / Click)
function handleRowClick(e, id) {
    if (e.shiftKey && state.lastClickedId) {
        // --- Shift 多选逻辑 ---
        const lastIdx = state.currentVisibleIds.indexOf(state.lastClickedId);
        const currIdx = state.currentVisibleIds.indexOf(id);
        
        if (lastIdx !== -1 && currIdx !== -1) {
            const start = Math.min(lastIdx, currIdx);
            const end = Math.max(lastIdx, currIdx);
            
            // 选中中间所有点
            for (let i = start; i <= end; i++) {
                state.selectedIds.add(state.currentVisibleIds[i]);
            }
        }
    } else if (e.ctrlKey || e.metaKey) {
        // --- Ctrl 反选逻辑 ---
        if (state.selectedIds.has(id)) {
            state.selectedIds.delete(id);
            state.lastClickedId = null; // 取消选中不记录 Last
        } else {
            state.selectedIds.add(id);
            state.lastClickedId = id;
        }
    } else {
        // --- 单击单选逻辑 ---
        state.selectedIds.clear(); // 清空其他
        state.selectedIds.add(id); // 选中当前
        state.lastClickedId = id;
    }

    // 刷新 UI 和 地图
    updatePoiListUI();
    refreshMapHighlights();
}

// 辅助：只刷新勾选类别的图层，避免全部重绘
function refreshMapHighlights() {
    ['教育', '医疗', '文娱', '商业', '其他'].forEach(cat => {
        const cb = document.getElementById(`cb_${cat}`);
        if (cb && cb.checked && state.pois[cat]) {
            renderPoiLayer(cat);
        }
    });
}

window.handleDelete = function(cat, id, isDel) {
    if (isDel) state.deletedIds = state.deletedIds.filter(x => x != id);
    else {
        state.deletedIds.push(id);
        // 删除时也要从选中列表中移除
        state.selectedIds.delete(id);
    }
    renderPoiLayer(cat); updatePoiListUI();
};


// ==========================================
// 2. 空间分析功能 (重写)
// ==========================================

// 工具：一键清除
window.clearAllAnalysis = function() {
    state.analysisLayers.forEach(l => map.removeLayer(l));
    state.analysisLayers = [];
    state.drawLayer.clearLayers();
    if(state.userPoiSelection) { map.removeLayer(state.userPoiSelection); state.userPoiSelection=null; }
    document.getElementById('serviceResult').style.display = 'none';
    state.lastServiceGeoJSON = null;
    state.selectedIds.clear(); // 清除选中状态
    refreshMapHighlights();
    state.lastServiceGeoJSON = null;
};

// --- A. 服务区分析 (Network Based) ---

// 1. 激活框选 POI 工具
window.activateBoxSelect = function() {
    alert("请在地图上绘制一个矩形，以框选特定的设施点");
    new L.Draw.Rectangle(map, { shapeOptions: { color: '#333', weight: 1, dashArray: '5, 5' } }).enable();
    
    // 监听绘制完成
    map.once(L.Draw.Event.CREATED, function(e) {
        if (state.userPoiSelection) map.removeLayer(state.userPoiSelection);
        state.userPoiSelection = e.layer;
        map.addLayer(state.userPoiSelection);
        // document.getElementById('selection-status').style.display = 'block';
    });
};

// 2. 获取当前有效的 POI 坐标列表
function getTargetPois() {
    let coords = [];
    let box = state.userPoiSelection ? state.userPoiSelection.getBounds() : null;

    ['教育', '医疗', '文娱', '商业', '其他'].forEach(cat => {
        const cb = document.getElementById(`cb_${cat}`);
        if (cb && cb.checked && state.pois[cat]) {
            state.pois[cat].features.forEach(f => {
                // 排除已删除的
                if (state.deletedIds.includes(f.properties.osm_id)) return;
                // 如果列表中有高亮选中的点，则只分析选中的点；
                if (state.selectedIds.size > 0 && !state.selectedIds.has(id)) return;
                
                // 否则，分析全部（或框选范围内的全部）
                const lat = f.geometry.coordinates[1];
                const lng = f.geometry.coordinates[0];
                
                // 如果有框选，必须在框内
                if (box) {
                    if (box.contains([lat, lng])) coords.push([lng, lat]);
                } else {
                    coords.push([lng, lat]);
                }
                const id = f.properties.osm_id;
            });
        }
    });
    return coords;
}

// 3. 执行路网分析
window.runNetworkAnalysis = async function() {
    // 先清除旧的
    window.clearAllAnalysis();
    // 稍微修改一下 getTargetPois 逻辑，或者在这里处理
    // 如果用户手动在列表里选了几个点，就只分析这几个点，无需框选
    let targetPois = getTargetPois();
    // 如果没选中也没框选，提示
    if (targetPois.length === 0) { 
        if (state.selectedIds.size > 0) alert("您选中的POI点不在分析范围内！");
        else alert("请先勾选左侧类型，或者选中列表中的点！"); 
        return; 
    }

    // const targetPois = getTargetPois();
    // if (targetPois.length === 0) { alert("没有选中的 POI 点！请先勾选左侧类型，或者重新框选范围。"); return; }

    // 获取距离阈值
    let val = parseFloat(document.getElementById('thresholdVal').value);
    const unit = document.getElementById('thresholdUnit').value;
    
    // 换算成米 (步行速度约 5km/h => 83m/min)
    let distMeters = unit === 'min' ? val * 83 : val;

    const btn = document.querySelector('button[onclick="runNetworkAnalysis()"]');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在进行路网计算...';

    try {
        const res = await fetch('/api/analyze/service_area', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ pois: targetPois, distance: distMeters })
        });
        const result = await res.json();
        
        if (result.error) { alert("分析出错: " + result.error); return; }
        if (!result.geometry) { alert("分析结果为空 (可能是范围内没有路网)"); return; }

        // 渲染服务区 (半透明)
        const layer = L.geoJSON(result.geometry, {
            interactive: false,
            style: { color: 'none', fillColor: '#8b5cf6', fillOpacity: 0.4 } // 紫色半透明
        }).addTo(map);
        state.analysisLayers.push(layer);
        state.lastServiceGeoJSON = result.geometry; // 存起来给盲区分析用
        
        map.fitBounds(layer.getBounds());

        // 显示统计结果
        const div = document.getElementById('serviceResult');
        div.style.display = 'block';
        div.innerHTML = `
            <b>路网分析结果:</b><br>
            覆盖建筑: <b>${result.building_count}</b> 栋<br>
            覆盖面积: <b>${result.building_area_sqm}</b> m²
        `;

    } catch(e) { console.error(e); alert("网络请求失败"); }
    finally { btn.innerHTML = '<i class="fa-solid fa-spider"></i> 开始路网分析'; }
};


// --- B. 盲区分析 ---

window.startBlindSpotDraw = function() {
    if (!state.lastServiceGeoJSON) { alert("请先执行服务区分析！系统需要知道哪些区域已经被覆盖了。"); return; }
    
    alert("请绘制一个【分析区域】(矩形或多边形)");
    // 启用绘图
    new L.Draw.Polygon(map).enable(); // 或者提供工具栏

    map.once(L.Draw.Event.CREATED, async function(e) {
        state.drawLayer.addLayer(e.layer);
        
        // 调用后端计算差集
        try {
            const res = await fetch('/api/analyze/blind_spot', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ 
                    draw_geometry: e.layer.toGeoJSON().geometry,
                    service_geometry: state.lastServiceGeoJSON
                })
            });
            const data = await res.json();
            
            if (data.geometry) {
                const blindLayer = L.geoJSON(data.geometry, {
                    interactive: false,
                    style: { color: 'red', fillColor: 'red', fillOpacity: 0.6, weight: 1 }
                }).addTo(map);
                state.analysisLayers.push(blindLayer);
                state.drawLayer.clearLayers(); // 清除用户画的框
                alert("红色区域为覆盖盲区");
            } else {
                alert("恭喜！您绘制的区域已完全被覆盖，无盲区。");
            }
        } catch(err) { console.error(err); }
    });
};


// --- C. 居民点缓冲区 ---

window.activatePlaceSelect = function() {
    if (!document.getElementById('cb_places').checked) { alert("请先在上方勾选 '显示居民点'！"); return; }
    
    alert("【交互模式已激活】\n1. 点击居民点：生成/取消分析\n2. 鼠标悬停：查看已分析点的结果");
    
    const placesLayer = state.layers['places'];
    if (!placesLayer) return;

    // 遍历每一个居民点 Marker，绑定高级事件
    placesLayer.eachLayer(layer => {
        // 防止重复绑定，先解绑
        layer.off('click');
        layer.off('mouseover');

        const props = layer.feature.properties;
        const id = props.osm_id; // 必须有唯一 ID

        // 1. 点击事件：切换 分析/清除
        layer.on('click', async (e) => {
            let rawVal = document.getElementById('placeBufferDist').value;
            let dist = parseFloat(rawVal);
            
            // 校验：如果输入为空或小于等于0，强制设为 1000
            if (isNaN(dist) || dist <= 0) {
                dist = 1000;
                document.getElementById('placeBufferDist').value = 1000; // 回填 UI
            }

            // A. 如果已经分析过 -> 清除分析
            if (state.placeAnalyses[id]) {
                const record = state.placeAnalyses[id];
                map.removeLayer(record.layer); // 移除地图上的圆
                delete state.placeAnalyses[id]; // 删状态
                
                // 恢复默认 Tooltip (只显示名字)
                layer.unbindTooltip(); 
                layer.bindTooltip(props.name, { direction: 'top', offset: [0, -5] });
                
                return; // 结束
            }

            // B. 如果未分析 -> 执行分析
            // 显示加载状态
            layer.bindTooltip("正在分析...", { permanent: true, direction: 'top' }).openTooltip();

            try {
                const res = await fetch('/api/analyze/place_buffer', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ coord: [e.latlng.lng, e.latlng.lat], distance: dist })
                });
                const data = await res.json();

                // 绘制缓冲区圆 (interactive: false 保证鼠标能穿透圆点到下面的 Marker)
                const circle = L.geoJSON(data.geometry, {
                    interactive: false, 
                    style: { color: '#10b981', fillColor: '#10b981', fillOpacity: 0.2 }
                }).addTo(map);

                // 生成结果 HTML
                const infoHTML = generatePlaceInfoHTML(props.name, dist, data);

                // 存入状态
                state.placeAnalyses[id] = {
                    layer: circle,
                    info: infoHTML // 缓存 HTML 文本
                };

                // 分析完成后，立即显示结果 Tooltip
                layer.unbindTooltip(); // 移除"正在分析"
                layer.bindTooltip(infoHTML, { 
                    permanent: false, // 鼠标移开消失
                    direction: 'top', 
                    opacity: 1,
                    className: 'place-tooltip' // 可在 CSS 自定义样式
                }).openTooltip();

            } catch (err) {
                console.error(err);
                layer.bindTooltip("分析失败").openTooltip();
                setTimeout(() => layer.bindTooltip(props.name), 2000);
            }
        });

        // 2. 悬停事件：如果有分析结果，显示结果；否则显示名字
        // (Leaflet 的 bindTooltip 自动处理了 mouseover/mouseout，
        //  我们只需要在 click 成功后更新 Tooltip 内容即可，上面的 click 逻辑已涵盖)
    });
};

// 辅助函数：生成漂亮的 HTML 提示信息
function generatePlaceInfoHTML(name, dist, data) {
    let html = `<div style="text-align:left; min-width:150px;">`;
    html += `<strong>🏠 ${name}</strong> <span style="font-size:10px; color:#666">(${dist}m)</span><hr style="margin:4px 0">`;
    
    if (data.is_complete) {
        html += `<div style="color:#10b981; font-weight:bold;">✔ 服务设施完善</div>`;
    } else {
        html += `<div style="color:#ef4444; font-weight:bold;">✘ 设施缺失</div>`;
        html += `<div style="font-size:11px; margin-top:2px;">缺: ${data.missing_types.join(', ')}</div>`;
    }
    
    html += `<div style="font-size:10px; color:#888; margin-top:4px;">现有: ${data.found_types.join(', ') || '无'}</div>`;
    html += `</div>`;
    return html;
}

// --- 路网与底图 ---
const roadColors = { 
    'motorway': '#d946ef', 
    'trunk': '#f97316', 
    'primary': '#eab308', 
    'secondary': '#3b82f6' , 
    'residential': '#6366f1', 
    'other': '#9ca3af' 
};
document.querySelectorAll('.road-checkbox').forEach(cb => {
    cb.addEventListener('change', async (e) => {
        const type = e.target.value;
        if (e.target.checked) {
            const res = await fetch(`/api/roads?type=${type}`);
            const data = await res.json();
            // 注意：other 类型通常线比较细，这里可以加个判断
            const weight = (type === 'other' || type === 'residential') ? 1 : 3;
            
            state.roadLayers[type] = L.geoJSON(data, {
                style: { 
                    color: roadColors[type] || '#333', 
                    weight: weight, // 细化小路
                    opacity: 0.7 
                },

            onEachFeature: (feature, layer) => {
                    // 1. 绑定基础 Popup (非编辑模式下显示)
                    layer.bindPopup(`<b>${feature.properties.name || "未命名道路"}</b><br>类型: ${feature.properties.fclass}`);

                    // 2. 绑定点击事件拦截
                    layer.on('click', (e) => {
                        // 如果处于 Info 或 Edit 模式
                        if (editState.mode === 'info' || editState.mode === 'edit') {
                            // 阻止默认行为 (防止打开Popup)
                            if (e.originalEvent) {
                                e.originalEvent.stopPropagation();
                                e.originalEvent.preventDefault();
                            }
                            
                            // 打开属性表单 (注意第二个参数传 'roads')
                            openFeatureForm(feature, 'roads');
                        }
                    });
                }

            }).addTo(map);
        } else {
            if (state.roadLayers[type]) {
                map.removeLayer(state.roadLayers[type]);
                delete state.roadLayers[type];
            }
        }
    });
});
window.toggleLayer = async function(name) {
    const cb = document.getElementById(`cb_${name}`);
    if (cb.checked) {
        const res = await fetch(`/api/${name}`);
        let style = name==='buildings'?{color:'#666',weight:1}:{radius:5,fillColor:'#8b5cf6',color:'#fff',weight:1, fillOpacity:1};
        
        state.layers[name] = L.geoJSON(await res.json(), { 
            style:style, 
            pointToLayer: name==='places'?(f,l)=>L.circleMarker(l,style):null,
            // 给 feature 绑定 ID，方便后续查找
            onEachFeature: (f, l) => {
                // 如果是居民点，预先绑定一个简单的 Tooltip 显示名字
                if(name === 'places') {
                    // 默认显示名字，但会被后面的分析结果覆盖
                    l.bindTooltip(f.properties.name, { direction: 'top', offset: [0, -5] });
                } else {
                    l.bindPopup(f.properties.name);
                }
                // 点击拦截逻辑
                l.on('click', (e) => {
                    // 如果处于 Info 或 Edit 模式
                    if (editState.mode === 'info' || editState.mode === 'edit') {
                        // 1. 阻止原生的 DOM 事件冒泡 (防止触发地图点击)
                        if (e.originalEvent) {
                            e.originalEvent.stopPropagation();
                            e.originalEvent.preventDefault();
                        }
                        
                        // 2. 打开属性框
                        openFeatureForm(f, name); 
                        
                        // 3. 这里的 return 很重要，阻止后续逻辑
                        return;
                    }
                    
                    // 下面是默认逻辑 (如居民点分析)，如果不拦截就会执行
                });
            }
        }).addTo(map);
    } else { 
        if(state.layers[name]) { 
            map.removeLayer(state.layers[name]); 
            delete state.layers[name]; 
        }
        
        // 如果关闭了居民点图层，也要把所有相关的绿色缓冲区清除
        if (name === 'places') {
            Object.values(state.placeAnalyses).forEach(item => map.removeLayer(item.layer));
            state.placeAnalyses = {}; // 清空记录
        }
    }
};


// ==========================================
// 5. 数据导入与重置功能
// ==========================================

window.openUploadModal = function() {
    document.getElementById('uploadModal').style.display = 'flex';
    document.getElementById('uploadStatus').innerText = "";
    document.getElementById('uploadStatus').style.color = "#333";
};

window.closeUploadModal = function() {
    document.getElementById('uploadModal').style.display = 'none';
};

// 核心：一键重置前端状态
function resetFrontendState() {
    // 1. 清空地图图层
    Object.keys(state.layers).forEach(k => { map.removeLayer(state.layers[k]); });
    Object.keys(state.roadLayers).forEach(k => { map.removeLayer(state.roadLayers[k]); });
    state.analysisLayers.forEach(l => map.removeLayer(l));
    state.drawLayer.clearLayers();
    if (state.userPoiSelection) map.removeLayer(state.userPoiSelection);

    // 2. 重置数据缓存
    state.pois = {};
    state.layers = {};
    state.roadLayers = {};
    state.analysisLayers = [];
    state.deletedIds = [];
    state.placeAnalyses = {};
    state.lastServiceGeoJSON = null;
    state.userPoiSelection = null;
    state.missingQueue = [];

    // 3. 取消所有复选框的勾选
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    
    // 4. 清空列表
    document.getElementById('poiListContainer').innerHTML = '<div style="text-align:center; padding:10px; color:#999;">数据已更新，请重新勾选加载</div>';
    
    // 5. 清除分析结果面板
    document.getElementById('serviceResult').style.display = 'none';
}

// 提交上传
window.submitUpload = async function() {
    const statusDiv = document.getElementById('uploadStatus');
    statusDiv.innerText = "正在上传并处理数据，请稍候...";
    statusDiv.style.color = "blue";

    const formData = new FormData();
    const f_pois = document.getElementById('file_pois').files[0];
    const f_roads = document.getElementById('file_roads').files[0];
    const f_places = document.getElementById('file_places').files[0];
    const f_buildings = document.getElementById('file_buildings').files[0];
    const f_class = document.getElementById('file_class').files[0];

    if (!f_pois && !f_roads && !f_places && !f_buildings && !f_class) {
        statusDiv.innerText = "请至少选择一个文件！";
        statusDiv.style.color = "red";
        return;
    }

    if(f_pois) formData.append('pois', f_pois);
    if(f_roads) formData.append('roads', f_roads);
    if(f_places) formData.append('places', f_places);
    if(f_buildings) formData.append('buildings', f_buildings);
    if(f_class) formData.append('classification', f_class);

    try {
        const res = await fetch('/api/data/upload', {
            method: 'POST',
            body: formData // 自动设置 Content-Type multipart/form-data
        });
        const result = await res.json();

        if (result.status === 'success') {
            statusDiv.innerText = "上传成功！";
            statusDiv.style.color = "green";
            
            // 重置界面
            resetFrontendState();
            document.getElementById('dataSourceTag').innerText = "当前: 自定义数据";
            
            // 重新检查缺失分类
            setTimeout(() => {
                closeUploadModal();
                checkMissingClassifications();
                alert("数据已加载。为了避免缓存干扰，所有图层已重置，请在左侧重新勾选查看。");
            }, 1000);
        } else {
            statusDiv.innerText = "上传失败: " + result.message;
            statusDiv.style.color = "red";
        }
    } catch (e) {
        console.error(e);
        statusDiv.innerText = "网络请求错误";
        statusDiv.style.color = "red";
    }
};

// 恢复默认
window.resetToDefaultData = async function() {
    if(!confirm("确定要清除自定义数据并恢复系统默认示例数据吗？")) return;
    
    // 1. 获取 UI 元素
    const statusDiv = document.getElementById('uploadStatus');
    // 获取当前被点击的按钮（为了禁用它防止重复点击）
    // 这里使用了简单的选择器，确保选中那个红色的按钮
    const resetBtn = document.querySelector('button[onclick="resetToDefaultData()"]');
    const originalText = resetBtn.innerHTML;

    // 2. 设置“加载中”状态
    statusDiv.innerText = "正在从服务器重新加载默认数据，这可能需要一点时间...";
    statusDiv.style.color = "blue";
    
    // 禁用按钮并显示转圈图标
    resetBtn.disabled = true;
    resetBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 数据恢复中...';
    
    try {
        // 3. 发送请求
        const res = await fetch('/api/data/reset', { method: 'POST' });
        const result = await res.json();
        
        // 4. 处理结果
        if (result.status === 'success') {
            statusDiv.innerText = "数据恢复成功！正在重置地图...";
            statusDiv.style.color = "green";
            
            // 稍微延迟一下，让用户看到“成功”两个字，再关闭弹窗
            setTimeout(() => {
                resetFrontendState();
                document.getElementById('dataSourceTag').innerText = "当前: 默认示例数据";
                
                // 恢复按钮状态（虽然马上要关闭弹窗了，但保持良好习惯）
                resetBtn.disabled = false;
                resetBtn.innerHTML = originalText;
                statusDiv.innerText = ""; // 清空状态文字
                
                closeUploadModal();
                checkMissingClassifications(); // 重新检查分类
                alert("已成功恢复默认示例数据。");
            }, 500);
        } else {
            throw new Error("后端返回错误");
        }
    } catch(e) {
        console.error(e);
        statusDiv.innerText = "重置失败，请检查网络或服务器日志。";
        statusDiv.style.color = "red";
        
        // 恢复按钮，允许重试
        resetBtn.disabled = false;
        resetBtn.innerHTML = originalText;
        alert("重置失败，请稍后重试。");
    }
};


// ==========================================
// 6. 编辑器功能
// ==========================================

// 编辑器状态
const editState = {
    mode: 'none', // none, info, add, edit
    targetLayerType: null, // pois, roads...
    editingFeatureId: null, // 当前正在编辑的 ID
    editingFeatureGeom: null, // 暂存的新几何
    tempDrawLayer: null // 正在重绘的图层
};

// 1. 模式切换
window.setEditMode = function(mode) {
    // 重置按钮状态
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    
    if (editState.mode === mode) {
        // 如果再次点击当前模式，则取消模式
        editState.mode = 'none';
        document.getElementById('editModeTip').style.display = 'none';
        map.getContainer().style.cursor = '';
    } else {
        editState.mode = mode;
        const btnId = mode === 'info' ? 'btnToolInfo' : (mode === 'edit' ? 'btnToolEdit' : '');
        if(btnId) document.getElementById(btnId).classList.add('active');
        
        const tip = document.getElementById('editModeTip');
        tip.style.display = 'block';
        tip.innerText = mode === 'info' ? '当前模式: 查看属性 (点击要素)' : '当前模式: 编辑要素 (点击要素)';
        
        map.getContainer().style.cursor = 'crosshair';
    }
    
    // 清除可能存在的绘图
    if (editState.tempDrawLayer) {
        state.drawLayer.removeLayer(editState.tempDrawLayer);
        editState.tempDrawLayer = null;
    }
};

// 2. 新增流程
window.openAddModal = function() {
    document.getElementById('layerSelectModal').style.display = 'flex';
};
window.closeLayerModal = function() {
    document.getElementById('layerSelectModal').style.display = 'none';
};

window.startDrawNew = function(layerType, geomType) {
    closeLayerModal();
    editState.mode = 'add';
    editState.targetLayerType = layerType;
    document.getElementById('editModeTip').style.display = 'block';
    document.getElementById('editModeTip').innerText = `正在新增: ${layerType} (请绘制)`;
    document.getElementById('btnToolAdd').classList.add('active');
    
    // 启动绘图工具
    let drawer;
    if (geomType === 'Point') drawer = new L.Draw.Marker(map);
    else if (geomType === 'LineString') drawer = new L.Draw.Polyline(map);
    else if (geomType === 'Polygon') drawer = new L.Draw.Polygon(map);
    
    drawer.enable();
    
    // 监听绘制完成 (一次性)
    map.once(L.Draw.Event.CREATED, function(e) {
        const layer = e.layer;
        editState.tempDrawLayer = layer; // 暂存图形
        state.drawLayer.addLayer(layer);
        
        // 打开表单，传入空数据
        openFeatureForm(null, layerType);
    });
};

// 3. 表单逻辑 (修改版：显示所有属性)
function openFeatureForm(feature, layerType) {
    const modal = document.getElementById('featureFormModal');
    const container = document.getElementById('formContainer');
    const footer = document.getElementById('formFooter');
    const geomSection = document.getElementById('geomEditSection');
    
    container.innerHTML = "";
    modal.style.display = 'flex';
    
    let props = {};
    
    if (feature) {
        // 编辑/查看模式：使用现有属性
        props = JSON.parse(JSON.stringify(feature.properties)); // 深拷贝
        document.getElementById('formTitle').innerText = editState.mode === 'info' ? "查看属性 (全部字段)" : "编辑属性";
        editState.editingFeatureId = props.osm_id;
        editState.targetLayerType = layerType;
    } else {
        // 新增模式：初始化默认字段 (新增时只给最基础的，用户填完保存后后台会生成ID)
        document.getElementById('formTitle').innerText = "新增要素 - 填写属性";
        props = { name: "", fclass: "" }; 
        editState.editingFeatureId = null;
    }

    // --- 核心修改：动态渲染所有字段 ---
    
    // 1. 获取所有键
    const keys = Object.keys(props);
    
    // 2. 排序：让 osm_id, fclass, name 排在最前面，其他按字母顺序排
    const priorityKeys = ['osm_id', 'fclass', 'name', 'code'];
    keys.sort((a, b) => {
        const idxA = priorityKeys.indexOf(a);
        const idxB = priorityKeys.indexOf(b);
        // 如果都在优先级列表里，按列表顺序排
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        // 如果 A 在优先级里，A 排前
        if (idxA !== -1) return -1;
        // 如果 B 在优先级里，B 排前
        if (idxB !== -1) return 1;
        // 都不在，按字母顺序
        return a.localeCompare(b);
    });

    // 3. 循环渲染
    keys.forEach(key => {
        // 排除 geometry 字段 (虽然通常 properties 里没有 geometry，但防万一)
        if (key !== 'geometry') {
            renderInputRow(container, key, props[key]);
        }
    });

    // --- 界面状态控制 ---
    
    if (editState.mode === 'info') {
        // 查看模式：禁用所有输入
        container.querySelectorAll('input').forEach(i => {
            i.disabled = true;
            i.style.border = 'none'; // 去掉边框，看起来像纯文本
            i.style.background = 'transparent';
        });
        footer.style.display = 'none';
        geomSection.style.display = 'none';
    } else {
        // 编辑/新增模式
        footer.style.display = 'block';
        geomSection.style.display = (editState.mode === 'edit') ? 'block' : 'none';
        
        // 强制禁用 osm_id 编辑 (这是主键，不能改)
        const idInput = container.querySelector('input[data-key="osm_id"]');
        if(idInput) {
            idInput.disabled = true;
            idInput.style.background = '#f3f4f6';
            idInput.title = "系统生成ID，不可修改";
        }
    }
}

// 辅助函数：渲染单行输入框 (稍微优化了一下样式)
function renderInputRow(container, key, value) {
    const div = document.createElement('div');
    div.className = 'form-row';
    
    // 处理 null 或 undefined
    let displayValue = value;
    if (value === null || value === undefined) displayValue = ""; 
    
    // 如果值太长，显示 tooltip
    div.innerHTML = `
        <label style="font-weight:bold; color:#444;">${key}</label>
        <input type="text" data-key="${key}" value="${displayValue}" autocomplete="off">
    `;
    container.appendChild(div);
}

window.closeFormModal = function() {
    document.getElementById('featureFormModal').style.display = 'none';
    // 如果是新增模式且取消了，清除临时画的图
    if (editState.mode === 'add' && editState.tempDrawLayer) {
        state.drawLayer.removeLayer(editState.tempDrawLayer);
        editState.tempDrawLayer = null;
    }
    // 如果是编辑模式重绘取消了，也要清除
    if (editState.mode === 'edit' && editState.tempDrawLayer) {
        state.drawLayer.removeLayer(editState.tempDrawLayer);
        editState.tempDrawLayer = null;
        editState.editingFeatureGeom = null;
    }
};

// 4. 提交保存
window.submitFeatureForm = async function() {
    const inputs = document.querySelectorAll('#formContainer input');
    const newProps = {};
    inputs.forEach(input => {
        const key = input.getAttribute('data-key');
        newProps[key] = input.value;
    });

    const url = editState.mode === 'add' ? '/api/feature/add' : '/api/feature/update';
    const body = {
        layer_type: editState.targetLayerType,
        properties: newProps
    };

    if (editState.mode === 'add') {
        // 新增：必须传 geometry
        body.feature = {
            type: "Feature",
            properties: newProps,
            geometry: editState.tempDrawLayer.toGeoJSON().geometry
        };
    } else {
        // 编辑：传 ID
        body.id = editState.editingFeatureId;
        // 如果重绘了几何，传新几何
        if (editState.editingFeatureGeom) {
            body.geometry = editState.editingFeatureGeom;
        }
    }

    try {
        const res = await fetch(url, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        const result = await res.json();
        
        if (result.status === 'success') {
            alert("保存成功！");
            closeFormModal();
            // 刷新对应的图层
            if (document.getElementById(`cb_${editState.targetLayerType}`)) {
                // 模拟重新勾选
                if (editState.targetLayerType === 'pois') {
                    // POI 比较特殊，是分分类的，这里简单粗暴刷新所有已选分类
                    ['教育','医疗','文娱','商业','其他'].forEach(c => {
                        if(document.getElementById(`cb_${c}`).checked) toggleCategory(c); 
                    });
                } else {
                    // 刷新 Roads/Places/Buildings
                    toggleLayer(editState.targetLayerType);
                    // 如果是路网，可能需要刷新分级，这里简单处理重新加载
                    if(editState.targetLayerType === 'roads') {
                         document.querySelectorAll('.road-checkbox:checked').forEach(cb => {
                             cb.checked = false; cb.click(); // 触发重新加载
                         });
                    }
                }
            }
            // 清理临时图层
            if(editState.tempDrawLayer) state.drawLayer.removeLayer(editState.tempDrawLayer);
            
            // 退出模式
            setEditMode('none');
        } else {
            alert("保存失败: " + result.message);
        }
    } catch(e) { console.error(e); alert("网络错误"); }
};

// 5. 重绘几何 (编辑模式下)
window.redrawGeometry = function() {
    // 隐藏模态框
    document.getElementById('featureFormModal').style.display = 'none';
    alert("请在地图上绘制新的形状");
    
    // 判断几何类型
    let geomType = 'Point'; // 默认
    // 简单的判断：roads=line, buildings=poly, others=point
    if (editState.targetLayerType === 'roads') geomType = 'LineString';
    else if (editState.targetLayerType === 'buildings') geomType = 'Polygon';
    
    let drawer;
    if (geomType === 'Point') drawer = new L.Draw.Marker(map);
    else if (geomType === 'LineString') drawer = new L.Draw.Polyline(map);
    else if (geomType === 'Polygon') drawer = new L.Draw.Polygon(map);
    
    drawer.enable();
    
    map.once(L.Draw.Event.CREATED, function(e) {
        editState.tempDrawLayer = e.layer;
        state.drawLayer.addLayer(e.layer);
        
        // 记录新几何
        editState.editingFeatureGeom = e.layer.toGeoJSON().geometry;
        
        // 重新打开模态框
        document.getElementById('featureFormModal').style.display = 'flex';
    });
};


// ==========================================
// 7. 结果导出与统计模块
// ==========================================

// --- A. 导出地图图片 ---
window.exportMapImage = function() {
    const mapNode = document.getElementById('map');
    const btn = document.querySelector('button[onclick="exportMapImage()"]');
    const oldText = btn.innerHTML;
    
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在生成...';
    btn.disabled = true;

    // 临时隐藏 zoom 控件和左下角坐标，让图片更纯净
    const controls = document.querySelectorAll('.leaflet-control-container, .mouse-coords-box');
    controls.forEach(c => c.style.display = 'none');

    domtoimage.toPng(mapNode, {
        width: mapNode.clientWidth,
        height: mapNode.clientHeight,
        quality: 0.95
    })
    .then(function (dataUrl) {
        const link = document.createElement('a');
        link.download = 'webgis-map-export.png';
        link.href = dataUrl;
        link.click();
        
        // 恢复 UI
        controls.forEach(c => c.style.display = '');
        btn.innerHTML = oldText;
        btn.disabled = false;
    })
    .catch(function (error) {
        console.error('oops, something went wrong!', error);
        alert("导出失败，可能是底图跨域问题或浏览器兼容性。");
        controls.forEach(c => c.style.display = '');
        btn.innerHTML = oldText;
        btn.disabled = false;
    });
};

// --- B. POI 数量统计 (饼图) ---
// 全局变量存储当前图表数据，用于 CSV 导出
let currentChartData = null; 

window.showPoiStats = function() {
    // 1. 统计前端已加载的数据
    // 我们按照 '分类' (category) 来统计，也可以按 fclass
    const stats = { '教育':0, '医疗':0, '文娱':0, '商业':0, '其他':0 };
    
    // 遍历 state.pois
    Object.keys(state.pois).forEach(cat => {
        if (state.pois[cat]) {
            // 排除已删除的
            const validCount = state.pois[cat].features.filter(f => !state.deletedIds.includes(f.properties.osm_id)).length;
            if (stats[cat] !== undefined) stats[cat] += validCount;
        }
    });

    const total = Object.values(stats).reduce((a,b)=>a+b, 0);
    if (total === 0) { alert("当前没有加载任何 POI 数据，请先在数据管理中勾选类型。"); return; }

    // 2. 准备 ECharts 数据
    const chartData = Object.keys(stats).map(k => ({ value: stats[k], name: k }));
    
    // 缓存数据用于导出表格
    currentChartData = {
        title: "POI设施数量统计",
        headers: ["设施类型", "数量", "占比"],
        rows: chartData.map(d => [d.name, d.value, ((d.value/total)*100).toFixed(1)+'%'])
    };

    // 3. 渲染图表
    openChartModal("POI 设施数量统计");
    const chart = echarts.init(document.getElementById('echartsContainer'));
    
    const option = {
        tooltip: { trigger: 'item' },
        legend: { top: '5%', left: 'center' },
        series: [{
            name: '设施数量',
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: false,
            itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
            label: { show: false, position: 'center' },
            emphasis: { label: { show: true, fontSize: 20, fontWeight: 'bold' } },
            labelLine: { show: false },
            data: chartData,
            // 使用我们预定义的颜色
            color: ['#3b82f6', '#ef4444', '#ec4899', '#f59e0b', '#6b7280'] 
        }]
    };
    chart.setOption(option);
};

// --- C. 居民点完善度统计 (柱状图) ---
window.showPlaceStats = async function() {
    const dist = document.getElementById('statsBufferDist').value;
    const btn = document.querySelector('button[onclick="showPlaceStats()"]');
    const oldText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 计算中...';
    btn.disabled = true;

    try {
        // 调用后端批量分析接口
        const res = await fetch('/api/stats/places_completeness', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ distance: dist })
        });
        const data = await res.json();
        
        // 数据转换: { 'town': {complete:10, missing:5}, ... }
        const categories = Object.keys(data); // X轴：居民点类型
        if (categories.length === 0) { alert("无居民点数据"); return; }

        const completeData = categories.map(k => data[k].complete);
        const missingData = categories.map(k => data[k].missing);

        // 缓存数据用于导出表格
        currentChartData = {
            title: `居民点服务完善度统计 (${dist}m)`,
            headers: ["居民点类型 (fclass)", "完善数量", "缺失数量", "总计"],
            rows: categories.map((k, i) => [k, completeData[i], missingData[i], completeData[i]+missingData[i]])
        };

        // 渲染图表
        openChartModal(`居民点服务完善度统计 (半径 ${dist}米)`);
        const chart = echarts.init(document.getElementById('echartsContainer'));

        const option = {
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            legend: { top: '5%' },
            grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
            xAxis: { type: 'category', data: categories, axisLabel: { interval: 0, rotate: 30 } },
            yAxis: { type: 'value' },
            series: [
                { name: '服务完善', type: 'bar', stack: 'total', label: { show: true }, data: completeData, itemStyle: { color: '#10b981' } },
                { name: '服务缺失', type: 'bar', stack: 'total', label: { show: true }, data: missingData, itemStyle: { color: '#ef4444' } }
            ]
        };
        chart.setOption(option);

    } catch (e) {
        console.error(e);
        alert("分析失败，请检查后端日志。");
    } finally {
        btn.innerHTML = oldText;
        btn.disabled = false;
    }
};

// --- 辅助功能 ---

function openChartModal(title) {
    document.getElementById('chartModal').style.display = 'flex';
    document.getElementById('chartTitle').innerText = title;
    // 销毁旧实例，防止 ghost effect
    const container = document.getElementById('echartsContainer');
    echarts.dispose(container);
}

// 导出 CSV 功能
window.exportCurrentChartData = function() {
    if (!currentChartData) return;
    
    // 1. 构建 CSV 内容 (添加 BOM 防止中文乱码)
    let csvContent = "\uFEFF"; 
    // 表头
    csvContent += currentChartData.headers.join(",") + "\n";
    // 数据行
    currentChartData.rows.forEach(row => {
        csvContent += row.join(",") + "\n";
    });

    // 2. 创建下载链接
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${currentChartData.title}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};


// ==========================================
// 8. 界面交互功能 (侧边栏折叠)
// ==========================================

window.toggleSidebar = function() {
    const sidebar = document.getElementById('mainSidebar');
    const icon = document.getElementById('sidebarToggleIcon');
    
    // 切换 CSS 类
    sidebar.classList.toggle('collapsed');
    
    // 切换图标方向
    if (sidebar.classList.contains('collapsed')) {
        // 折叠状态：显示向右箭头，提示可以展开
        icon.className = 'fa-solid fa-chevron-right';
        // 可选：折叠时给个提示
        icon.parentElement.title = "展开侧边栏";
    } else {
        // 展开状态：显示向左箭头，提示可以折叠
        icon.className = 'fa-solid fa-chevron-left';
        icon.parentElement.title = "折叠侧边栏";
    }
};