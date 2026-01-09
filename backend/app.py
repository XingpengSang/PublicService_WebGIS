# frontend/static/js/main.js
# @FileDescription: 主入口文件：负责初始化、绑定事件、挂载全局函数

import sys
import os
import webbrowser
from threading import Timer
from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import json
import mimetypes
from shapely.geometry import shape, mapping, Point
from shapely.ops import unary_union

# 解决 Windows JS MIME 问题
mimetypes.add_type('application/javascript', '.js')

# 核心路径配置 (打包适配)
if getattr(sys, 'frozen', False):
    # 【打包模式 (Frozen/EXE)】
    # 1. 内部资源 (前端代码)：解压在临时目录 sys._MEIPASS 中
    BUNDLE_DIR = sys._MEIPASS
    TEMPLATE_DIR = os.path.join(BUNDLE_DIR, 'frontend', 'templates')
    STATIC_DIR = os.path.join(BUNDLE_DIR, 'frontend', 'static')
    
    # 2. 外部资源 (数据文件)：位于 EXE 同级目录
    # sys.executable 是 .exe 文件的绝对路径
    EXEC_DIR = os.path.dirname(sys.executable)
    DATA_DIR = os.path.join(EXEC_DIR, 'data')
else:
    # 【源码开发模式】
    # 基于当前文件位置寻找
    BASE_DIR = os.path.dirname(os.path.abspath(__file__)) # backend/
    PROJECT_ROOT = os.path.dirname(BASE_DIR)            # 项目根目录/
    
    TEMPLATE_DIR = os.path.join(PROJECT_ROOT, 'frontend', 'templates')
    STATIC_DIR = os.path.join(PROJECT_ROOT, 'frontend', 'static')
    DATA_DIR = os.path.join(PROJECT_ROOT, 'data')

# 配置文件路径
CLASS_FILE_PATH = os.path.join(DATA_DIR, 'classification.txt')

app = Flask(__name__, template_folder=TEMPLATE_DIR, static_folder=STATIC_DIR)
# 限制上传大小
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024 
CORS(app)

@app.after_request
def fix_mime_type(response):
    """修正 JS 文件的 MIME 类型，防止某些浏览器报错"""
    if request.path.endswith('.js'):
        response.headers['Content-Type'] = 'application/javascript; charset=utf-8'
    return response

# region --- 1. 全局数据容器 ---
# 这些变量现在是可变的，可以被默认数据填充，也可以被用户上传覆盖
POIS_DATA = None
ROADS_DATA = None
PLACES_DATA = None
BUILDINGS_DATA = None
CLASS_MAP = None
ALL_ROAD_SHAPES = []
ALL_BUILDING_SHAPES = []
# endregion

# region --- 2. 数据加载逻辑 ---

def load_json_file(path):
    """从指定路径加载 GeoJSON 文件"""
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except: return {"type": "FeatureCollection", "features": []}
    return {"type": "FeatureCollection", "features": []}

def parse_classification(file_content=None):
    """解析分类配置，支持从文件路径读，或直接解析字符串内容"""
    mapping = {}
    lines = []
    
    # 情况A: 从默认文件路径读取
    if file_content is None and os.path.exists(CLASS_FILE_PATH):
        with open(CLASS_FILE_PATH, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    # 情况B: 用户上传了文件内容 (bytes)
    elif file_content:
        lines = file_content.decode('utf-8').splitlines()

    for line in lines:
        parts = line.strip().split(',')
        if len(parts) >= 2:
            mapping[parts[0].strip()] = parts[1].strip()
    return mapping

def preprocess_geometry():
    """将 GeoJSON 转为 Shapely 对象，加速分析"""
    global ALL_ROAD_SHAPES, ALL_BUILDING_SHAPES
    ALL_ROAD_SHAPES = []
    ALL_BUILDING_SHAPES = []
    
    print("正在重新处理几何数据...")
    if ROADS_DATA:
        for f in ROADS_DATA.get('features', []):
            try: ALL_ROAD_SHAPES.append(shape(f['geometry']))
            except: pass
            
    if BUILDINGS_DATA:
        for f in BUILDINGS_DATA.get('features', []):
            try: ALL_BUILDING_SHAPES.append(shape(f['geometry']))
            except: pass
    print(f"几何处理完成: 路网 {len(ALL_ROAD_SHAPES)} 条, 建筑 {len(ALL_BUILDING_SHAPES)} 栋")

def load_defaults():
    """加载 ./data 目录下的默认示例数据"""
    global POIS_DATA, ROADS_DATA, PLACES_DATA, BUILDINGS_DATA, CLASS_MAP
    print("--- 正在加载默认示例数据 ---")
    POIS_DATA = load_json_file(os.path.join(DATA_DIR, 'hunan-osm_pois_free.geojson'))
    ROADS_DATA = load_json_file(os.path.join(DATA_DIR, 'hunan-osm_roads_free.geojson'))
    PLACES_DATA = load_json_file(os.path.join(DATA_DIR, 'hunan-osm_places_free.geojson'))
    BUILDINGS_DATA = load_json_file(os.path.join(DATA_DIR, 'hunan-osm_buildings_a_free.geojson'))
    CLASS_MAP = parse_classification()
    preprocess_geometry()

# 系统启动时加载默认数据
load_defaults()

# endregion

# region --- 3. 数据管理接口 ---

@app.route('/api/data/reset', methods=['POST'])
def reset_data():
    """恢复默认数据"""
    load_defaults()
    return jsonify({"status": "success", "message": "已恢复默认示例数据"})

@app.route('/api/data/upload', methods=['POST'])
def upload_data():
    """接收用户上传的数据并覆盖全局变量"""
    global POIS_DATA, ROADS_DATA, PLACES_DATA, BUILDINGS_DATA, CLASS_MAP
    
    try:
        files = request.files
        has_update = False

        # 1. POIS
        if 'pois' in files:
            POIS_DATA = json.load(files['pois'])
            has_update = True
            
        # 2. Roads
        if 'roads' in files:
            ROADS_DATA = json.load(files['roads'])
            has_update = True

        # 3. Places
        if 'places' in files:
            PLACES_DATA = json.load(files['places'])
            has_update = True

        # 4. Buildings
        if 'buildings' in files:
            BUILDINGS_DATA = json.load(files['buildings'])
            has_update = True

        # 5. Classification
        if 'classification' in files:
            content = files['classification'].read()
            CLASS_MAP = parse_classification(content)
            has_update = True

        if has_update:
            # 如果更新了路网或建筑，需要重新生成几何索引
            preprocess_geometry()
            return jsonify({"status": "success", "message": "自定义数据加载成功"})
        else:
            return jsonify({"status": "warning", "message": "未接收到任何文件"}), 400

    except Exception as e:
        print(f"Upload Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
# endregion

# region --- 4. 业务逻辑接口 ---

@app.route('/')
def index(): return render_template('index.html')

@app.route('/api/classification/missing', methods=['GET'])
def check_missing_class():
    """检查 POI 数据中有哪些 fclass 未被分类映射覆盖"""
    if not POIS_DATA: return jsonify([])
    all_fclasses = set([f['properties'].get('fclass') for f in POIS_DATA['features'] if f['properties'].get('fclass')])
    missing = [fc for fc in all_fclasses if fc not in CLASS_MAP]
    return jsonify(missing)

@app.route('/api/classification/update', methods=['POST'])
def update_classification():
    """更新分类映射 (单个条目)"""
    data = request.json
    CLASS_MAP[data['fclass']] = data['category']
    # 注意：用户自定义模式下，我们暂不把修改写回默认文件，只更新内存
    # 只有在使用默认数据时才写文件，或者另存一个 user_class.txt
    # 这里为了简单，只更新内存映射，重启后失效
    return jsonify({"status": "success"})

@app.route('/api/pois', methods=['GET'])
def get_pois():
    """根据类别过滤 POI"""
    target_category = request.args.get('category')
    target_fclasses = [fc for fc, cat in CLASS_MAP.items() if cat == target_category]
    filtered = [f for f in POIS_DATA['features'] if f['properties'].get('fclass') in target_fclasses]
    return jsonify({"type": "FeatureCollection", "features": filtered})

@app.route('/api/roads', methods=['GET'])
def get_roads():
    """根据道路类型过滤路网"""
    req_type = request.args.get('type')
    # 定义映射 (如果用户上传了数据，fclass 字段需保持一致，或者此处需更通用的逻辑)
    ROAD_MAPPING = {
        'motorway': ['motorway', 'motorway_link'],
        'trunk':    ['trunk', 'trunk_link'],
        'primary':  ['primary', 'primary_link'],
        'secondary':['secondary', 'secondary_link'],
        'residential': ['residential', 'living_street'],
        'other': ['tertiary', 'tertiary_link', 'unclassified', 'service', 'footway', 'path', 'track', 'steps', 'pedestrian', 'cycleway', 'bridleway', 'unknown']
    }
    target = ROAD_MAPPING.get(req_type, [])
    filtered = [f for f in ROADS_DATA['features'] if f['properties'].get('fclass') in target]
    return jsonify({"type": "FeatureCollection", "features": filtered})

@app.route('/api/places', methods=['GET'])
def get_places(): return jsonify(PLACES_DATA)

@app.route('/api/buildings', methods=['GET'])
def get_buildings(): 
    """返回建筑数据，限制数量"""
    # 限制返回数量，防止过大
    limit = 5000
    return jsonify({"type": "FeatureCollection", "features": BUILDINGS_DATA['features'][:limit]})

# --- 空间分析接口 ---
# 辅助函数：根据删除列表过滤有效 POI
def get_active_pois(deleted_ids):
    """根据前端传来的删除列表，过滤出有效的POI"""
    if not deleted_ids:
        return POIS_DATA['features']
    
    # 确保 ID 类型一致 (转字符串对比，防止 int/str 不匹配)
    del_set = set(str(x) for x in deleted_ids)
    
    return [
        f for f in POIS_DATA['features'] 
        if str(f['properties'].get('osm_id')) not in del_set
    ]

@app.route('/api/analyze/service_area', methods=['POST'])
def analyze_service_area():
    """计算设施服务区及覆盖建筑统计"""
    try:
        req = request.json
        poi_coords = req.get('pois', [])
        distance_meters = float(req.get('distance', 1000))
        buffer_deg = distance_meters / 111000.0 
        
        if not poi_coords: return jsonify({"error": "No POIs"}), 400
        
        poi_points = [Point(c[0], c[1]) for c in poi_coords]
        search_area = unary_union([p.buffer(buffer_deg) for p in poi_points])

        valid_roads = []
        # 使用当前内存中的路网几何
        for road in ALL_ROAD_SHAPES:
            if search_area.intersects(road):
                valid_roads.append(road)

        if not valid_roads: return jsonify({"geometry": None, "count": 0, "area": 0})

        road_width_deg = 30 / 111000.0 
        service_shapes = [r.buffer(road_width_deg) for r in valid_roads]
        final_service_area = unary_union(service_shapes)
        
        b_count = 0
        b_area_deg = 0
        # 使用当前内存中的建筑几何
        for b in ALL_BUILDING_SHAPES:
            if final_service_area.intersects(b):
                b_count += 1
                b_area_deg += b.area

        return jsonify({
            "geometry": mapping(final_service_area),
            "building_count": b_count,
            "building_area_sqm": round(b_area_deg * (111000**2) * 0.8, 2)
        })
    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 500

@app.route('/api/analyze/place_buffer', methods=['POST'])
def analyze_place_buffer():
    """分析居民点缓冲区内的设施类型覆盖情况"""
    try:
        req = request.json
        coord = req.get('coord')
        dist = float(req.get('distance', 1000))
        deleted_ids = req.get('deleted_ids', []) 
        
        buffer_geom = Point(coord[0], coord[1]).buffer(dist/111000.0)
        
        found_types = set()
        
        # 使用过滤后的数据进行遍历
        active_features = get_active_pois(deleted_ids)
        
        for f in active_features:
            # 必须转为 shape 才能做几何判断
            p_geom = shape(f['geometry']) 
            if buffer_geom.contains(p_geom):
                found_types.add(CLASS_MAP.get(f['properties'].get('fclass'), '其他'))
        
        required = {'教育', '医疗', '商业', '文娱'}
        missing = list(required - found_types)
        return jsonify({
            "geometry": mapping(buffer_geom),
            "found_types": list(found_types),
            "missing_types": missing,
            "is_complete": len(missing)==0
        })
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route('/api/analyze/blind_spot', methods=['POST'])
def analyze_blind_spot():
    try:
        req = request.json
        draw_geo = shape(req.get('draw_geometry'))    # 用户画的框 (分析范围)
        service_geo = shape(req.get('service_geometry')) # 路网服务区 (细长的路网)

        # 1. 定义“路边延伸距离” (Off-road access distance)
        # 距离服务路网 access_distance(默认100米) 以内，都算作被覆盖，不是盲区。
        # 填充路网之间的空隙，避免把街区内部误判为盲区。
        access_distance_meters = float(req.get('access_distance', 100))
        access_buffer_deg = access_distance_meters / 111000.0 # 转换距离 (度)
        
        # 2. 对路网服务区进行缓冲，模拟“实际服务覆盖面”
        effective_service_area = service_geo.buffer(access_buffer_deg)

        # 3. 计算差集: 盲区 = 用户画的框 - 实际服务覆盖面
        blind_spot = draw_geo.difference(effective_service_area)

        if blind_spot.is_empty:
            return jsonify({"geometry": None, "message": "无盲区"})
        
        return jsonify({
            "geometry": mapping(blind_spot)
        })

    except Exception as e:
        print(f"Blind Spot Error: {e}")
        return jsonify({"error": str(e)}), 500
# endregion

# region --- 5. 数据编辑接口 ---

@app.route('/api/feature/add', methods=['POST'])
def add_feature():
    """新增要素"""
    try:
        req = request.json
        layer_type = req.get('layer_type') # pois, roads, places, buildings
        feature = req.get('feature') # GeoJSON feature object
        
        # 简单的 ID 生成策略 (时间戳 + 随机数，或自增)
        import time
        import random
        new_id = int(time.time() * 1000) + random.randint(0, 1000)
        feature['properties']['osm_id'] = new_id
        
        # 根据图层类型添加到对应的全局变量
        target_data = None
        if layer_type == 'pois': target_data = POIS_DATA
        elif layer_type == 'roads': target_data = ROADS_DATA
        elif layer_type == 'places': target_data = PLACES_DATA
        elif layer_type == 'buildings': target_data = BUILDINGS_DATA
        
        if target_data is None:
            return jsonify({"status": "error", "message": "Unknown layer type"}), 400
            
        # 添加到内存
        target_data['features'].append(feature)
        
        # 如果是路网或建筑，需要更新几何索引以供空间分析使用
        if layer_type in ['roads', 'buildings']:
            preprocess_geometry()
            
        return jsonify({"status": "success", "new_id": new_id})
        
    except Exception as e:
        print(f"Add Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/feature/update', methods=['POST'])
def update_feature():
    """更新要素 (属性 + 几何)"""
    try:
        req = request.json
        layer_type = req.get('layer_type')
        feature_id = req.get('id')
        new_props = req.get('properties')
        new_geom = req.get('geometry') # 可选，如果只改属性则为空
        
        target_data = None
        if layer_type == 'pois': target_data = POIS_DATA
        elif layer_type == 'roads': target_data = ROADS_DATA
        elif layer_type == 'places': target_data = PLACES_DATA
        elif layer_type == 'buildings': target_data = BUILDINGS_DATA
        
        if target_data is None: return jsonify({"error": "Unknown layer"}), 400
        
        # 查找并更新
        found = False
        for f in target_data['features']:
            # 注意: osm_id 可能是 int 或 str，统一转 str 比较
            if str(f['properties'].get('osm_id')) == str(feature_id):
                # 更新属性
                f['properties'].update(new_props)
                # 更新几何 (如果提供了)
                if new_geom:
                    f['geometry'] = new_geom
                found = True
                break
        
        if not found:
            return jsonify({"status": "error", "message": "Feature not found"}), 404
            
        # 如果更新了几何，重建索引
        if new_geom and layer_type in ['roads', 'buildings']:
            preprocess_geometry()
            
        return jsonify({"status": "success"})

    except Exception as e:
        print(f"Update Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
# endregion    

# region --- 6. 统计导出接口 ---

@app.route('/api/stats/places_completeness', methods=['POST'])
def stats_places_completeness():
    """批量统计所有居民点的服务完善情况"""
    try:
        # 获取距离阈值 (默认1000米)
        dist = float(request.json.get('distance', 1000))
        deleted_ids = request.json.get('deleted_ids', [])
        buffer_deg = dist / 111000.0
        
        # 必要的类型
        required_types = {'教育', '医疗', '商业', '文娱'}
        
        # 结果容器: { 'town': {'complete': 0, 'missing': 0}, 'village': ... }
        stats = {}
        
        # 预处理: 将所有 POI 转为 Shapely 点并附带分类
        poi_points = []
        for f in POIS_DATA['features']:
            try:
                geom = shape(f['geometry'])
                fclass = f['properties'].get('fclass')
                cat = CLASS_MAP.get(fclass, '其他')
                poi_points.append({'geom': geom, 'cat': cat})
            except: pass
            
        # 遍历所有居民点
        for p in PLACES_DATA['features']:
            p_type = p['properties'].get('fclass', 'unknown')
            
            # 初始化该类型的统计
            if p_type not in stats:
                stats[p_type] = {'complete': 0, 'missing': 0}
                
            # 生成缓冲区
            p_geom = shape(p['geometry'])
            p_buffer = p_geom.buffer(buffer_deg)
            
            # 检查包含的 POI 类型
            found_cats = set()
            for poi in poi_points:
                if p_buffer.contains(poi['geom']):
                    found_cats.add(poi['cat'])
                    # 优化：如果所有类型都齐了，就不用继续找了
                    if required_types.issubset(found_cats):
                        break
            
            # 判断是否完善
            missing = required_types - found_cats
            if len(missing) == 0:
                stats[p_type]['complete'] += 1
            else:
                stats[p_type]['missing'] += 1
                
        return jsonify(stats)

    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 500
# endregion

# 启动逻辑 (自动打开浏览器) 
def open_browser():
    # 自动打开默认浏览器
    webbrowser.open_new('http://127.0.0.1:5000/')

if __name__ == '__main__':
    # 如果是打包模式，关闭 Debug，自动弹窗
    if getattr(sys, 'frozen', False):
        print("正在启动城市公共设施服务分析系统...")
        print(f"数据目录: {DATA_DIR}")
        Timer(1.5, open_browser).start()
        app.run(debug=False, port=5000)
    else:
        # 开发模式
        app.run(debug=True, port=5000)
