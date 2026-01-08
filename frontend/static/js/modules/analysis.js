// frontend/static/js/modules/analysis.js
// @FileDescription: 分析功能模块：服务区分析、盲区分析、居民点分析等

import { startProcess, endProcess } from './processMgr.js';
import { state } from './state.js';
import { API } from './api.js';
import { refreshMapHighlights, updatePoiListUI } from './layerManager.js';

// --- 工具：一键清除 ---
export function clearAllAnalysis() {
    state.analysisLayers.forEach(l => state.map.removeLayer(l));
    state.analysisLayers = [];
    state.drawLayer.clearLayers();
    if(state.userPoiSelection) { state.map.removeLayer(state.userPoiSelection); state.userPoiSelection=null; }
    document.getElementById('serviceResult').style.display = 'none';
    state.lastServiceGeoJSON = null;
    
    // 清除 POI 选中
    state.selectedIds.clear(); 
    refreshMapHighlights();
    updatePoiListUI();

    // 清除居民点分析缓存 (如果有)
    // 注意：这里是否清除居民点分析取决于需求，通常“清除所有”应该也包含这个
    Object.values(state.placeAnalyses).forEach(item => state.map.removeLayer(item.layer));
    state.placeAnalyses = {};
    
    // 恢复居民点图层的原始 Tooltip (如果有)
    if(state.layers['places']) {
        state.layers['places'].eachLayer(l => {
            l.unbindTooltip();
            l.bindTooltip(l.feature.properties.name, {direction:'top', offset:[0,-5]});
        });
    }
}

// --- A. 框选工具 ---
export function activateBoxSelect() {
    alert("请在地图上绘制一个矩形，以框选特定的设施点");
    new L.Draw.Rectangle(state.map, { shapeOptions: { color: '#333', weight: 1, dashArray: '5, 5' } }).enable();
    state.map.once(L.Draw.Event.CREATED, function(e) {
        if (state.userPoiSelection) state.map.removeLayer(state.userPoiSelection);
        state.userPoiSelection = e.layer;
        state.map.addLayer(state.userPoiSelection);
    });
}

// 辅助函数：获取当前选中的 POI 坐标列表
function getTargetPois() {
    let coords = [];
    let box = state.userPoiSelection ? state.userPoiSelection.getBounds() : null;
    ['教育', '医疗', '文娱', '商业', '其他'].forEach(cat => {
        const cb = document.getElementById(`cb_${cat}`);
        if (cb && cb.checked && state.pois[cat]) {
            state.pois[cat].features.forEach(f => {
                const id = f.properties.osm_id;
                if (state.deletedIds.includes(id)) return;
                // 逻辑：如果有选中，只分析选中；否则分析全部/框选
                if (state.selectedIds.size > 0 && !state.selectedIds.has(id)) return;
                
                const lat = f.geometry.coordinates[1];
                const lng = f.geometry.coordinates[0];
                if (box) { if (box.contains([lat, lng])) coords.push([lng, lat]); } 
                else { coords.push([lng, lat]); }
            });
        }
    });
    return coords;
}

// --- B. 服务区分析 ---
export async function runNetworkAnalysis() {
    // 这里我们只清除旧的服务区分析，不清除居民点分析
    state.analysisLayers.forEach(l => state.map.removeLayer(l));
    state.analysisLayers = [];
    state.drawLayer.clearLayers();
    
    let targetPois = getTargetPois();
    if (targetPois.length === 0) { 
        if (state.selectedIds.size > 0) alert("您选中的POI点不在分析范围内！");
        else alert("请先勾选左侧类型，或者选中列表中的点！"); 
        return; 
    }

    let val = parseFloat(document.getElementById('thresholdVal').value);
    const unit = document.getElementById('thresholdUnit').value;
    let distMeters = unit === 'min' ? val * 83 : val;

    const btn = document.querySelector('button[onclick="runNetworkAnalysis()"]');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 计算中...';

    const signal = startProcess("正在进行路网拓扑计算，请稍候...");

    try {
        const result = await API.analyzeService({ pois: targetPois, distance: distMeters }, signal);
        if (result.error) { alert("Error: " + result.error); return; }
        if (!result.geometry) { alert("分析结果为空"); return; }

        const layer = L.geoJSON(result.geometry, { interactive: false, style: { color: 'none', fillColor: '#8b5cf6', fillOpacity: 0.4 } }).addTo(state.map);
        state.analysisLayers.push(layer);
        state.lastServiceGeoJSON = result.geometry;
        state.map.fitBounds(layer.getBounds());

        const div = document.getElementById('serviceResult');
        div.style.display = 'block';
        div.innerHTML = `<b>结果:</b> 覆盖建筑 <b>${result.building_count}</b> 栋, 面积 <b>${result.building_area_sqm}</b> m²`;
    } catch(e) { 
        if (e.name === 'AbortError') {
            console.log('Fetch aborted'); // 被用户取消了，不做任何事
        } else {
            console.error(e); alert("网络请求失败: " + e.message);
        }
    }
    finally { 
        btn.innerHTML = '<i class="fa-solid fa-spider"></i> 开始路网分析'; 
        endProcess();
    }
}

// --- C. 盲区分析 ---
export function startBlindSpotDraw() {
    if (!state.lastServiceGeoJSON) { alert("请先执行服务区分析！"); return; }
    alert("请绘制分析区域");
    new L.Draw.Polygon(state.map).enable();
    
    state.map.once(L.Draw.Event.CREATED, async function(e) {
        state.drawLayer.addLayer(e.layer);
        const signal = startProcess("正在计算覆盖盲区...");

        try {
            const data = await API.analyzeBlind({ 
                draw_geometry: e.layer.toGeoJSON().geometry, 
                service_geometry: state.lastServiceGeoJSON 
            }, signal); // 传入 signal

            if (data.geometry) {
                const blindLayer = L.geoJSON(data.geometry, { interactive: false, style: { color: 'red', fillColor: 'red', fillOpacity: 0.6, weight: 1 } }).addTo(state.map);
                state.analysisLayers.push(blindLayer);
                state.drawLayer.clearLayers();
            } else { alert("无盲区"); }
        } catch(err) {
            if (err.name !== 'AbortError') console.error(err);
        } finally {
            endProcess(); // 结束
        }
    });
}

// --- D. 居民点缓冲区 (交互升级版) ---
// 辅助函数：生成美观的 HTML 提示
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

// 居民点分析
export function activatePlaceSelect() {
    if (!document.getElementById('cb_places').checked) { alert("请先勾选 '显示居民点'"); return; }
    
    alert("【交互模式已激活】\n1. 点击居民点：生成/取消分析\n2. 鼠标悬停：查看已分析点的结果");
    
    const placesLayer = state.layers['places'];
    if (!placesLayer) return;

    placesLayer.eachLayer(layer => {
        layer.off('click'); 
        layer.off('mouseover'); // 清除旧事件
        
        const props = layer.feature.properties; 
        const id = props.osm_id;
        
        layer.on('click', async (e) => {
            // 必须在这里重新拦截，因为之前的拦截逻辑被 layer.off('click') 删掉了
            if (state.editMode && (state.editMode.mode === 'info' || state.editMode.mode === 'edit')) {
                if (e.originalEvent) {
                    e.originalEvent.stopPropagation();
                    e.originalEvent.preventDefault();
                }
                // 调用全局挂载的打开表单函数
                if (window.openFeatureForm) {
                    window.openFeatureForm(layer.feature, 'places');
                }
                return; // 🛑 立即结束，不执行下面的分析逻辑
            }
            
            // 获取输入框的距离
            let rawVal = document.getElementById('placeBufferDist').value;
            let dist = parseFloat(rawVal);
            if (isNaN(dist) || dist <= 0) { dist = 1000; document.getElementById('placeBufferDist').value=1000; }

            // A. 如果已分析 -> 清除
            if (state.placeAnalyses[id]) {
                state.map.removeLayer(state.placeAnalyses[id].layer);
                delete state.placeAnalyses[id];
                layer.unbindTooltip(); 
                layer.bindTooltip(props.name, {direction:'top', offset:[0,-5]});
                return;
            }

            // B. 未分析 -> 执行分析
            // layer.bindTooltip("分析中...", {permanent:true, direction:'top'}).openTooltip();
            const signal = startProcess(`正在分析居民点 [${props.name}] 的设施配置...`);
            
            try {
                const data = await API.analyzePlaceBuffer({ 
                    coord:[e.latlng.lng, e.latlng.lat], 
                    distance:dist, 
                    deleted_ids: state.deletedIds
                }, signal);
                
                // 绘制圆 (interactive: false 保证鼠标穿透)
                const circle = L.geoJSON(data.geometry, {
                    interactive: false, 
                    style: {color:'#10b981', fillColor:'#10b981', fillOpacity:0.2}
                }).addTo(state.map);
                
                // 生成 HTML
                const infoHTML = generatePlaceInfoHTML(props.name, dist, data);
                
                // 存入状态
                state.placeAnalyses[id] = { layer: circle, info: infoHTML };
                
                // 绑定新的 Tooltip (Leaflet 自动处理 hover)
                layer.unbindTooltip(); 
                layer.bindTooltip(infoHTML, {
                    permanent:false, 
                    direction:'top', 
                    className:'place-tooltip', // 需要 style.css 支持
                    opacity: 1
                }).openTooltip();

            } catch(err) { 
                if (err.name !== 'AbortError') {
                    console.error(err);
                    layer.bindTooltip("分析失败").openTooltip();
                }
            } finally {
                endProcess(); // 结束
            }
        });
    });
}