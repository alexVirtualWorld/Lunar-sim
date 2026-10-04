const STORAGE_KEY = 'lunar-sim-language';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' }
];

const DICT = {
  en: {
    "network.online":"ONLINE",
    "network.offline":"OFFLINE",
    "network.pilots":"PILOTS: {count}",
    "hud.heading":"HDG",
    "hud.controls":"W/S Drive · A/D Steer · Shift Brake · L Lights · C Camera · R Reset · B Browse",
    "browse.latitudeHint":"Latitude: −90° to 90°; north positive, south negative",
    "browse.longitudeHint":"East longitude: 0° to 360°",
    'app.title':'Lunar Sim','language.label':'Language','browse.toggle':'Browse Moon · B','browse.toggleReturn':'Browse Mode · B Return to Drive',
    'browse.title':'Lunar Browse · Browse Mode','browse.controls':'Drag to rotate · Right-drag to pan · Wheel to zoom','browse.controls2':'Click the lunar surface to select a location, then start driving from there.','browse.dataIntro':'Real lunar imagery and DEM terrain. Terrain detail increases automatically as you zoom.',
    'map.layers':'MAP LAYERS','map.grid':'GRID','map.places':'PLACES','map.filter':'FILTER','map.route':'ROUTE','common.off':'OFF','common.names':'NAMES','common.all':'ALL','filter.unexplored':'UNEXPLORED','filter.inprogress':'IN PROGRESS','filter.explored':'EXPLORED',
    'browse.noSelection':'No location selected','browse.latitude':'LATITUDE','browse.longitude':'LONGITUDE','browse.goto':'GO TO','browse.fullMoon':'FULL MOON','browse.drive':'DRIVE FROM HERE','browse.returnRover':'RETURN TO ROVER','browse.shortHelp':'B: Browse / Drive · Esc: Return','browse.loading':'Loading lunar terrain…','browse.ready':'Terrain ready','browse.selected':'Location selected.','browse.invalid':'Invalid lunar coordinates.','browse.loadingLanding':'Loading terrain…','browse.noTerrain':'Terrain data is unavailable at this location.','site.customLanding':'CUSTOM LUNAR LANDING',
    'brand':'LUNAR SIM','hud.loadingTerrain':'LOADING TERRAIN','hud.elev':'ELEV {value} m','hud.surfaceLock':'SURFACE LOCK','hud.surfaceMiss':'SURFACE CACHE MISS','hud.airborne':'AIRBORNE',
    'gravity.title':'GRAVITY','gravity.custom':'Custom','gravity.zero':'Zero gravity · 0.000 m/s²','gravity.moon':'Moon · 1.620 m/s²','gravity.mercury':'Mercury · 3.700 m/s²','gravity.venus':'Venus · 8.870 m/s²','gravity.earth':'Earth · 9.798 m/s²','gravity.mars':'Mars · 3.710 m/s²','gravity.jupiter':'Jupiter · 24.790 m/s²','gravity.saturn':'Saturn · 10.440 m/s²','gravity.uranus':'Uranus · 8.870 m/s²','gravity.neptune':'Neptune · 11.150 m/s²','gravity.sun':'Sun · 274.800 m/s²',
    'celestial.title':'CELESTIAL TIME · UTC','celestial.sun':'SUN','celestial.earth':'EARTH','celestial.photo':'PHOTO · P','celestial.now':'NOW','celestial.play':'PLAY','celestial.pause':'PAUSE','celestial.rate':'RATE','celestial.dayRate':'1 day/s',
    'exploration.title':'ROVER · EXPLORATION','exploration.lightsOn':'LIGHTS ON · L','exploration.lightsOff':'LIGHTS OFF · L','exploration.center':'CENTER · C','exploration.noArea':'NO ACTIVE AREA','exploration.loading':'GAZETTEER LOADING','exploration.odometer':'ODOMETER','exploration.session':'SESSION {value}','exploration.obelisks':'OBELISKS','exploration.clearRoute':'CLEAR ROUTE','exploration.areaComplete':'AREA COMPLETE','exploration.poiDiscovered':'POINT OF INTEREST DISCOVERED','exploration.obeliskUnlocked':'OBELISK UNLOCKED','exploration.poi':'POI','exploration.notExplored':'NOT EXPLORED','exploration.inProgress':'IN PROGRESS','exploration.completed':'COMPLETED',
    'minimap.title':'LOCAL MAP · NORTH UP','minimap.zoomIn':'Zoom in','minimap.zoomOut':'Zoom out','minimap.view':'VIEW {value} · NORTH UP',
    'debug.toggle':'DEBUG · F10','debug.title':'DEBUG HUD','debug.providerBoundaries':'DEM PROVIDER BOUNDARIES','debug.provider':'Provider','debug.block':'Block','debug.lod':'LOD','debug.meshes':'Active meshes','debug.tiles':'Cached height tiles','debug.packs':'Cached packs','debug.blocks':'Loaded blocks','debug.radius':'Moon radius','debug.origin':'Floating origin E/N','debug.rover':'Rover lat/lon/elev','debug.polar':'Polar provider','debug.cache':'Terrain cache',
    'confirm.clearRoute':'Clear the recorded rover route? Odometer and exploration progress will be kept.','photo.saved':'SAVED','photo.failed':'FAILED','popup.exploration':'EXPLORATION','popup.gazetteer':'USGS / IAU Gazetteer →','rover.current':'CURRENT ROVER','popup.featureType':'Feature Type','popup.location':'Location','popup.size':'Size','popup.approved':'Approved','popup.origin':'Origin','terrain.noBlock':'No DEM block for this coordinate.','terrain.sampleMissing':'DEM sample is missing at this location.','terrain.neighborhoodMissing':'Landing-area DEM coverage is incomplete.','terrain.visibleFailed':'Visible terrain failed to load.','debug.noRealDem':'NO REAL DEM','poi.rockField':'ROCK FIELD','poi.smallCrater':'SMALL CRATER','poi.ridgeView':'RIDGE VIEW','poi.lowBasin':'LOW BASIN','poi.sunlightPoint':'SUNLIGHT POINT','poi.scenicOverlook':'SCENIC OVERLOOK','poi.slope':'SLOPE','poi.geologyPoint':'GEOLOGY POINT'
  },
  'zh-CN': {
    "network.online":"已联机",
    "network.offline":"离线",
    "network.pilots":"玩家：{count}",
    "hud.heading":"航向",
    "hud.controls":"W/S 驾驶 · A/D 转向 · Shift 刹车 · L 车灯 · C 镜头 · R 重置 · B 浏览",
    "browse.latitudeHint":"纬度：−90° 至 90°，北正南负",
    "browse.longitudeHint":"东经：0° 至 360°",
    'app.title':'Lunar Sim','language.label':'语言','browse.toggle':'浏览月球 · B','browse.toggleReturn':'浏览模式 · B 返回驾驶','browse.title':'月球浏览 · Browse Mode','browse.controls':'拖动旋转 · 右键平移 · 滚轮缩放','browse.controls2':'单击月面选择地点，再从这里开始驾驶。','browse.dataIntro':'真实月球影像与 DEM 地形。缩放时自动提升地形细节。',
    'map.layers':'地图图层','map.grid':'经纬网','map.places':'地点','map.filter':'筛选','map.route':'路线','common.off':'关闭','common.names':'仅名称','common.all':'全部','filter.unexplored':'未探索','filter.inprogress':'探索中','filter.explored':'已探索',
    'browse.noSelection':'尚未选点','browse.latitude':'纬度','browse.longitude':'经度','browse.goto':'定位坐标','browse.fullMoon':'全月视图','browse.drive':'从这里驾驶','browse.returnRover':'返回月球车','browse.shortHelp':'B：浏览 / 驾驶 · Esc：返回','browse.loading':'正在加载月球地形…','browse.ready':'地形已就绪','browse.selected':'已选择地点。','browse.invalid':'月球坐标无效。','browse.loadingLanding':'正在加载地形…','browse.noTerrain':'此地点没有可用地形数据。','site.customLanding':'自定义月球着陆点',
    'brand':'LUNAR SIM','hud.loadingTerrain':'正在加载地形','hud.elev':'海拔 {value} m','hud.surfaceLock':'地面锁定','hud.surfaceMiss':'地形缓存缺失','hud.airborne':'腾空',
    'gravity.title':'重力','gravity.custom':'自定义','gravity.zero':'零重力 · 0.000 m/s²','gravity.moon':'月球 · 1.620 m/s²','gravity.mercury':'水星 · 3.700 m/s²','gravity.venus':'金星 · 8.870 m/s²','gravity.earth':'地球 · 9.798 m/s²','gravity.mars':'火星 · 3.710 m/s²','gravity.jupiter':'木星 · 24.790 m/s²','gravity.saturn':'土星 · 10.440 m/s²','gravity.uranus':'天王星 · 8.870 m/s²','gravity.neptune':'海王星 · 11.150 m/s²','gravity.sun':'太阳 · 274.800 m/s²',
    'celestial.title':'天体时间 · UTC','celestial.sun':'太阳','celestial.earth':'地球','celestial.photo':'拍照 · P','celestial.now':'现在','celestial.play':'播放','celestial.pause':'暂停','celestial.rate':'速率','celestial.dayRate':'1 天/秒',
    'exploration.title':'月球车 · 探索','exploration.lightsOn':'车灯开 · L','exploration.lightsOff':'车灯关 · L','exploration.center':'镜头居中 · C','exploration.noArea':'无活动探索区','exploration.loading':'地名数据加载中','exploration.odometer':'总里程','exploration.session':'本次 {value}','exploration.obelisks':'方尖碑','exploration.clearRoute':'清除路线','exploration.areaComplete':'区域探索完成','exploration.poiDiscovered':'发现兴趣点','exploration.obeliskUnlocked':'已解锁方尖碑','exploration.poi':'兴趣点','exploration.notExplored':'未探索','exploration.inProgress':'探索中','exploration.completed':'已完成',
    'minimap.title':'局部地图 · 北朝上','minimap.zoomIn':'放大','minimap.zoomOut':'缩小','minimap.view':'视野 {value} · 北朝上',
    'debug.toggle':'调试 · F10','debug.title':'调试信息','debug.providerBoundaries':'DEM 数据源边界','debug.provider':'数据源','debug.block':'区块','debug.lod':'LOD','debug.meshes':'活动网格','debug.tiles':'高度瓦片缓存','debug.packs':'数据包缓存','debug.blocks':'已加载区块','debug.radius':'月球半径','debug.origin':'浮动原点 E/N','debug.rover':'月球车 纬/经/海拔','debug.polar':'极区数据源','debug.cache':'地形缓存',
    'confirm.clearRoute':'清除已记录的月球车路线？总里程和探索进度会保留。','photo.saved':'已保存','photo.failed':'失败','popup.exploration':'探索','popup.gazetteer':'USGS / IAU 地名录 →','rover.current':'当前月球车','popup.featureType':'地貌类型','popup.location':'位置','popup.size':'尺寸','popup.approved':'批准年份','popup.origin':'命名来源','terrain.noBlock':'此坐标没有 DEM 区块。','terrain.sampleMissing':'此地点缺少 DEM 高程样本。','terrain.neighborhoodMissing':'着陆点附近 DEM 覆盖不完整。','terrain.visibleFailed':'可见地形加载失败。','debug.noRealDem':'无可用真实 DEM','poi.rockField':'岩块区','poi.smallCrater':'小型撞击坑','poi.ridgeView':'高地观测点','poi.lowBasin':'低洼区','poi.sunlightPoint':'日照观测点','poi.scenicOverlook':'远景摄影点','poi.slope':'坡壁','poi.geologyPoint':'异常地形'
  },
  ja: {
    "network.online":"オンライン",
    "network.offline":"オフライン",
    "network.pilots":"プレイヤー：{count}",
    "hud.heading":"方位",
    "hud.controls":"W/S 走行 · A/D 操舵 · Shift ブレーキ · L ライト · C カメラ · R リセット · B 閲覧",
    "browse.latitudeHint":"緯度：−90°～90°、北が正・南が負",
    "browse.longitudeHint":"東経：0°～360°",
    'app.title':'Lunar Sim','language.label':'言語','browse.toggle':'月を閲覧 · B','browse.toggleReturn':'閲覧モード · B 運転に戻る','browse.title':'月面閲覧 · Browse Mode','browse.controls':'ドラッグで回転 · 右ドラッグで平行移動 · ホイールでズーム','browse.controls2':'月面をクリックして地点を選び、そこから走行を開始します。','browse.dataIntro':'実際の月面画像と DEM 地形。ズームに応じて地形詳細を自動的に高めます。',
    'map.layers':'マップレイヤー','map.grid':'グリッド','map.places':'地点','map.filter':'フィルター','map.route':'ルート','common.off':'オフ','common.names':'名称のみ','common.all':'すべて','filter.unexplored':'未探索','filter.inprogress':'探索中','filter.explored':'探索済み',
    'browse.noSelection':'地点未選択','browse.latitude':'緯度','browse.longitude':'経度','browse.goto':'座標へ移動','browse.fullMoon':'月全体','browse.drive':'ここから走行','browse.returnRover':'ローバーへ戻る','browse.shortHelp':'B：閲覧 / 運転 · Esc：戻る','browse.loading':'月面地形を読み込み中…','browse.ready':'地形準備完了','browse.selected':'地点を選択しました。','browse.invalid':'無効な月面座標です。','browse.loadingLanding':'地形を読み込み中…','browse.noTerrain':'この地点の地形データは利用できません。','site.customLanding':'カスタム月面着陸地点',
    'brand':'LUNAR SIM','hud.loadingTerrain':'地形読み込み中','hud.elev':'標高 {value} m','hud.surfaceLock':'地表ロック','hud.surfaceMiss':'地形キャッシュなし','hud.airborne':'空中',
    'gravity.title':'重力','gravity.custom':'カスタム','gravity.zero':'無重力 · 0.000 m/s²','gravity.moon':'月 · 1.620 m/s²','gravity.mercury':'水星 · 3.700 m/s²','gravity.venus':'金星 · 8.870 m/s²','gravity.earth':'地球 · 9.798 m/s²','gravity.mars':'火星 · 3.710 m/s²','gravity.jupiter':'木星 · 24.790 m/s²','gravity.saturn':'土星 · 10.440 m/s²','gravity.uranus':'天王星 · 8.870 m/s²','gravity.neptune':'海王星 · 11.150 m/s²','gravity.sun':'太陽 · 274.800 m/s²',
    'celestial.title':'天体時刻 · UTC','celestial.sun':'太陽','celestial.earth':'地球','celestial.photo':'撮影 · P','celestial.now':'現在','celestial.play':'再生','celestial.pause':'一時停止','celestial.rate':'速度','celestial.dayRate':'1日/秒',
    'exploration.title':'ローバー · 探索','exploration.lightsOn':'ライト ON · L','exploration.lightsOff':'ライト OFF · L','exploration.center':'カメラ中央 · C','exploration.noArea':'探索エリアなし','exploration.loading':'地名データ読み込み中','exploration.odometer':'総走行距離','exploration.session':'今回 {value}','exploration.obelisks':'オベリスク','exploration.clearRoute':'ルート消去','exploration.areaComplete':'エリア探索完了','exploration.poiDiscovered':'探索ポイント発見','exploration.obeliskUnlocked':'オベリスク解除','exploration.poi':'POI','exploration.notExplored':'未探索','exploration.inProgress':'探索中','exploration.completed':'完了',
    'minimap.title':'ローカルマップ · 北上','minimap.zoomIn':'拡大','minimap.zoomOut':'縮小','minimap.view':'表示 {value} · 北上',
    'debug.toggle':'デバッグ · F10','debug.title':'デバッグ HUD','debug.providerBoundaries':'DEM プロバイダー境界','debug.provider':'プロバイダー','debug.block':'ブロック','debug.lod':'LOD','debug.meshes':'アクティブメッシュ','debug.tiles':'高度タイルキャッシュ','debug.packs':'パックキャッシュ','debug.blocks':'読み込みブロック','debug.radius':'月半径','debug.origin':'浮動原点 E/N','debug.rover':'ローバー 緯度/経度/標高','debug.polar':'極域プロバイダー','debug.cache':'地形キャッシュ',
    'confirm.clearRoute':'記録された走行ルートを消去しますか？走行距離と探索進捗は保持されます。','photo.saved':'保存済み','photo.failed':'失敗','popup.exploration':'探索','popup.gazetteer':'USGS / IAU Gazetteer →','rover.current':'現在のローバー','popup.featureType':'地形タイプ','popup.location':'位置','popup.size':'サイズ','popup.approved':'承認年','popup.origin':'名称由来','terrain.noBlock':'この座標の DEM ブロックがありません。','terrain.sampleMissing':'この地点の DEM 標高サンプルがありません。','terrain.neighborhoodMissing':'着陸地点周辺の DEM カバレッジが不完全です。','terrain.visibleFailed':'可視地形の読み込みに失敗しました。','debug.noRealDem':'実 DEM なし','poi.rockField':'岩塊地帯','poi.smallCrater':'小型クレーター','poi.ridgeView':'高地観測点','poi.lowBasin':'低地','poi.sunlightPoint':'日照観測点','poi.scenicOverlook':'遠景撮影点','poi.slope':'斜面','poi.geologyPoint':'特徴的地形'
  },
  ko: {
    "network.online":"온라인",
    "network.offline":"오프라인",
    "network.pilots":"플레이어: {count}",
    "hud.heading":"방향",
    "hud.controls":"W/S 주행 · A/D 조향 · Shift 브레이크 · L 라이트 · C 카메라 · R 초기화 · B 둘러보기",
    "browse.latitudeHint":"위도: −90°~90°, 북쪽 양수, 남쪽 음수",
    "browse.longitudeHint":"동경: 0°~360°",
    'app.title':'Lunar Sim','language.label':'언어','browse.toggle':'달 둘러보기 · B','browse.toggleReturn':'둘러보기 모드 · B 운전으로 돌아가기','browse.title':'달 둘러보기 · Browse Mode','browse.controls':'드래그 회전 · 오른쪽 드래그 이동 · 휠 확대/축소','browse.controls2':'달 표면을 클릭해 위치를 선택한 뒤 그곳에서 주행을 시작합니다.','browse.dataIntro':'실제 달 영상과 DEM 지형. 확대할수록 지형 세부 정보가 자동으로 높아집니다.',
    'map.layers':'지도 레이어','map.grid':'격자','map.places':'장소','map.filter':'필터','map.route':'경로','common.off':'끄기','common.names':'이름만','common.all':'전체','filter.unexplored':'미탐사','filter.inprogress':'탐사 중','filter.explored':'탐사 완료',
    'browse.noSelection':'선택한 위치 없음','browse.latitude':'위도','browse.longitude':'경도','browse.goto':'좌표로 이동','browse.fullMoon':'달 전체 보기','browse.drive':'여기서 주행','browse.returnRover':'로버로 돌아가기','browse.shortHelp':'B: 둘러보기 / 주행 · Esc: 돌아가기','browse.loading':'달 지형 불러오는 중…','browse.ready':'지형 준비 완료','browse.selected':'위치를 선택했습니다.','browse.invalid':'유효하지 않은 달 좌표입니다.','browse.loadingLanding':'지형 불러오는 중…','browse.noTerrain':'이 위치의 지형 데이터를 사용할 수 없습니다.','site.customLanding':'사용자 지정 달 착륙 지점',
    'brand':'LUNAR SIM','hud.loadingTerrain':'지형 불러오는 중','hud.elev':'고도 {value} m','hud.surfaceLock':'지표 고정','hud.surfaceMiss':'지형 캐시 없음','hud.airborne':'공중',
    'gravity.title':'중력','gravity.custom':'사용자 지정','gravity.zero':'무중력 · 0.000 m/s²','gravity.moon':'달 · 1.620 m/s²','gravity.mercury':'수성 · 3.700 m/s²','gravity.venus':'금성 · 8.870 m/s²','gravity.earth':'지구 · 9.798 m/s²','gravity.mars':'화성 · 3.710 m/s²','gravity.jupiter':'목성 · 24.790 m/s²','gravity.saturn':'토성 · 10.440 m/s²','gravity.uranus':'천왕성 · 8.870 m/s²','gravity.neptune':'해왕성 · 11.150 m/s²','gravity.sun':'태양 · 274.800 m/s²',
    'celestial.title':'천체 시간 · UTC','celestial.sun':'태양','celestial.earth':'지구','celestial.photo':'사진 · P','celestial.now':'현재','celestial.play':'재생','celestial.pause':'일시정지','celestial.rate':'속도','celestial.dayRate':'1일/초',
    'exploration.title':'로버 · 탐사','exploration.lightsOn':'라이트 켬 · L','exploration.lightsOff':'라이트 끔 · L','exploration.center':'카메라 중앙 · C','exploration.noArea':'활성 탐사 구역 없음','exploration.loading':'지명 데이터 불러오는 중','exploration.odometer':'누적 거리','exploration.session':'이번 주행 {value}','exploration.obelisks':'오벨리스크','exploration.clearRoute':'경로 지우기','exploration.areaComplete':'구역 탐사 완료','exploration.poiDiscovered':'관심 지점 발견','exploration.obeliskUnlocked':'오벨리스크 해제','exploration.poi':'POI','exploration.notExplored':'미탐사','exploration.inProgress':'탐사 중','exploration.completed':'완료',
    'minimap.title':'로컬 지도 · 북쪽 위','minimap.zoomIn':'확대','minimap.zoomOut':'축소','minimap.view':'범위 {value} · 북쪽 위',
    'debug.toggle':'디버그 · F10','debug.title':'디버그 HUD','debug.providerBoundaries':'DEM 공급자 경계','debug.provider':'공급자','debug.block':'블록','debug.lod':'LOD','debug.meshes':'활성 메시','debug.tiles':'높이 타일 캐시','debug.packs':'팩 캐시','debug.blocks':'로드된 블록','debug.radius':'달 반지름','debug.origin':'플로팅 원점 E/N','debug.rover':'로버 위도/경도/고도','debug.polar':'극지 공급자','debug.cache':'지형 캐시',
    'confirm.clearRoute':'기록된 로버 경로를 지울까요? 누적 거리와 탐사 진행도는 유지됩니다.','photo.saved':'저장됨','photo.failed':'실패','popup.exploration':'탐사','popup.gazetteer':'USGS / IAU Gazetteer →','rover.current':'현재 로버','popup.featureType':'지형 유형','popup.location':'위치','popup.size':'크기','popup.approved':'승인 연도','popup.origin':'명칭 유래','terrain.noBlock':'이 좌표에 DEM 블록이 없습니다.','terrain.sampleMissing':'이 위치의 DEM 고도 샘플이 없습니다.','terrain.neighborhoodMissing':'착륙 지점 주변 DEM 범위가 불완전합니다.','terrain.visibleFailed':'표시 지형을 불러오지 못했습니다.','debug.noRealDem':'실제 DEM 없음','poi.rockField':'암석 지대','poi.smallCrater':'소형 충돌구','poi.ridgeView':'고지 관측점','poi.lowBasin':'저지대','poi.sunlightPoint':'일조 관측점','poi.scenicOverlook':'원경 촬영점','poi.slope':'사면','poi.geologyPoint':'특이 지형'
  }
};


const PHOTO_DICT = {
  en: {'photo.title':'PHOTO MODE','photo.reset':'RESET CAMERA','photo.hideHud':'HIDE HUD','photo.camera':'CAMERA','photo.fov':'FOV','photo.roll':'ROLL','photo.speed':'MOVE SPEED','photo.cameraHelp':'Drag to orbit/look · Wheel zoom/speed · WASD move · Q/E height · Shift boost','photo.time':'TIME','photo.step':'STEP','photo.pause':'PAUSE','photo.resume':'RESUME','photo.networkLive':'Online world stays live; pause and slow motion are disabled.','photo.offlinePause':'Offline: pause, slow motion and frame step are available.','photo.lock':'LOCK ROVER','photo.unlock':'FREE CAMERA','photo.depth':'DEPTH OF FIELD','photo.enableDof':'ENABLE','photo.focusRover':'FOCUS ROVER','photo.focus':'FOCUS','photo.aperture':'APERTURE','photo.blur':'BLUR','photo.focusHelp':'Double-click the scene to set focus distance.','photo.look':'LOOK','photo.preset':'PRESET','photo.raw':'RAW','photo.cinema':'CINEMA','photo.warm':'WARM','photo.mono':'MONO','photo.exposure':'EXPOSURE','photo.contrast':'CONTRAST','photo.saturation':'SATURATION','photo.temperature':'TEMPERATURE','photo.vignette':'VIGNETTE','photo.grain':'GRAIN','photo.export':'STICKER · EXPORT','photo.sticker':'STICKER','photo.none':'NONE','photo.mission':'MISSION','photo.coords':'COORDINATES','photo.caption':'CAPTION','photo.resolution':'RESOLUTION','photo.save':'SAVE PNG','photo.saving':'SAVING…'},
  'zh-CN': {'photo.title':'拍照模式','photo.reset':'重置相机','photo.hideHud':'隐藏 HUD','photo.camera':'相机','photo.fov':'视野','photo.roll':'倾斜','photo.speed':'移动速度','photo.cameraHelp':'拖动环绕/观察 · 滚轮缩放/调速 · WASD 移动 · Q/E 升降 · Shift 加速','photo.time':'时间','photo.step':'逐帧','photo.pause':'暂停','photo.resume':'继续','photo.networkLive':'联网世界保持实时运行；暂停和慢动作不可用。','photo.offlinePause':'离线模式可使用暂停、慢动作和逐帧。','photo.lock':'锁定越野车','photo.unlock':'自由相机','photo.depth':'景深','photo.enableDof':'启用','photo.focusRover':'对焦越野车','photo.focus':'焦点距离','photo.aperture':'光圈','photo.blur':'虚化','photo.focusHelp':'双击场景可设置焦点距离。','photo.look':'画面','photo.preset':'预设','photo.raw':'原始','photo.cinema':'电影','photo.warm':'暖色','photo.mono':'黑白','photo.exposure':'曝光','photo.contrast':'对比度','photo.saturation':'饱和度','photo.temperature':'色温','photo.vignette':'暗角','photo.grain':'颗粒','photo.export':'贴纸与导出','photo.sticker':'贴纸','photo.none':'无','photo.mission':'任务标识','photo.coords':'坐标','photo.caption':'文字','photo.resolution':'分辨率','photo.save':'保存 PNG','photo.saving':'正在保存…'},
  ja: {'photo.title':'フォトモード','photo.reset':'カメラをリセット','photo.hideHud':'HUDを隠す','photo.camera':'カメラ','photo.fov':'画角','photo.roll':'傾き','photo.speed':'移動速度','photo.cameraHelp':'ドラッグ：回転/視点 · ホイール：ズーム/速度 · WASD：移動 · Q/E：上下','photo.time':'時間','photo.step':'コマ送り','photo.pause':'一時停止','photo.resume':'再開','photo.networkLive':'オンライン世界は進行します。一時停止とスローは使用できません。','photo.offlinePause':'オフラインでは一時停止、スロー、コマ送りを使用できます。','photo.lock':'ローバー固定','photo.unlock':'フリーカメラ','photo.depth':'被写界深度','photo.enableDof':'有効','photo.focusRover':'ローバーに合焦','photo.focus':'焦点距離','photo.aperture':'絞り','photo.blur':'ぼかし','photo.focusHelp':'シーンをダブルクリックして焦点を設定します。','photo.look':'画面効果','photo.preset':'プリセット','photo.raw':'標準','photo.cinema':'シネマ','photo.warm':'暖色','photo.mono':'モノクロ','photo.exposure':'露出','photo.contrast':'コントラスト','photo.saturation':'彩度','photo.temperature':'色温度','photo.vignette':'ビネット','photo.grain':'粒子','photo.export':'ステッカー・書き出し','photo.sticker':'ステッカー','photo.none':'なし','photo.mission':'ミッション','photo.coords':'座標','photo.caption':'文字','photo.resolution':'解像度','photo.save':'PNGを保存','photo.saving':'保存中…'},
  ko: {'photo.title':'사진 모드','photo.reset':'카메라 초기화','photo.hideHud':'HUD 숨기기','photo.camera':'카메라','photo.fov':'시야각','photo.roll':'기울기','photo.speed':'이동 속도','photo.cameraHelp':'드래그: 회전/시점 · 휠: 줌/속도 · WASD: 이동 · Q/E: 높이','photo.time':'시간','photo.step':'한 프레임','photo.pause':'일시정지','photo.resume':'계속','photo.networkLive':'온라인 세계는 계속 진행됩니다. 일시정지와 슬로 모션은 사용할 수 없습니다.','photo.offlinePause':'오프라인에서는 일시정지, 슬로 모션, 프레임 이동을 사용할 수 있습니다.','photo.lock':'로버 고정','photo.unlock':'자유 카메라','photo.depth':'피사계 심도','photo.enableDof':'사용','photo.focusRover':'로버 초점','photo.focus':'초점 거리','photo.aperture':'조리개','photo.blur':'흐림','photo.focusHelp':'장면을 두 번 클릭해 초점을 설정합니다.','photo.look':'화면 효과','photo.preset':'프리셋','photo.raw':'원본','photo.cinema':'시네마','photo.warm':'따뜻함','photo.mono':'흑백','photo.exposure':'노출','photo.contrast':'대비','photo.saturation':'채도','photo.temperature':'색온도','photo.vignette':'비네트','photo.grain':'입자','photo.export':'스티커 · 내보내기','photo.sticker':'스티커','photo.none':'없음','photo.mission':'미션','photo.coords':'좌표','photo.caption':'문구','photo.resolution':'해상도','photo.save':'PNG 저장','photo.saving':'저장 중…'}
};
for (const [language, entries] of Object.entries(PHOTO_DICT)) Object.assign(DICT[language], entries);

const PHOTO_TIME_STATUS = {
  en: {'photo.timePaused':'SIMULATION PAUSED','photo.timeRunning':'SIMULATION · {rate}×','photo.frameAdvanced':'FRAME +1 · PAUSED'},
  'zh-CN': {'photo.timePaused':'模拟已暂停','photo.timeRunning':'模拟速度 · {rate}×','photo.frameAdvanced':'已推进一帧 · 暂停'},
  ja: {'photo.timePaused':'シミュレーション一時停止','photo.timeRunning':'シミュレーション · {rate}×','photo.frameAdvanced':'1フレーム進行 · 一時停止'},
  ko: {'photo.timePaused':'시뮬레이션 일시정지','photo.timeRunning':'시뮬레이션 · {rate}×','photo.frameAdvanced':'한 프레임 이동 · 일시정지'}
};
for (const [language, entries] of Object.entries(PHOTO_TIME_STATUS)) Object.assign(DICT[language], entries);

const PHOTO_SHORTCUT_DICT = {
  en: {'photo.title':'PHOTO MODE · P','photo.shortcuts':'Space Pause/Resume · → Step · H Hide HUD · Esc Exit'},
  'zh-CN': {'photo.title':'拍照模式 · P','photo.shortcuts':'Space 暂停/继续 · → 推进一帧 · H 隐藏 HUD · Esc 退出'},
  ja: {'photo.title':'フォトモード · P','photo.shortcuts':'Space 一時停止/再開 · → コマ送り · H HUD表示切替 · Esc 終了'},
  ko: {'photo.title':'사진 모드 · P','photo.shortcuts':'Space 일시정지/계속 · → 한 프레임 · H HUD 전환 · Esc 종료'}
};
for (const [language, entries] of Object.entries(PHOTO_SHORTCUT_DICT)) Object.assign(DICT[language], entries);

const PHOTO_CAMERA_MODE_DICT = {
  en: {
    'photo.cameraModeLocked':'CAMERA MODE · ROVER LOCK',
    'photo.cameraModeFree':'CAMERA MODE · FREE',
    'photo.switchFree':'SWITCH TO FREE CAMERA',
    'photo.switchLock':'LOCK ROVER',
    'photo.cameraHelpLocked':'Drag: orbit rover · Wheel: zoom',
    'photo.cameraHelpFree':'Drag: look · Wheel: move speed · WASD: move · Q/E: height · Shift: boost'
  },
  'zh-CN': {
    'photo.cameraModeLocked':'相机模式 · 锁定越野车',
    'photo.cameraModeFree':'相机模式 · 自由相机',
    'photo.switchFree':'切换到自由相机',
    'photo.switchLock':'锁定越野车',
    'photo.cameraHelpLocked':'拖动：环绕越野车 · 滚轮：缩放',
    'photo.cameraHelpFree':'拖动：转动视角 · 滚轮：调整移动速度 · WASD：移动 · Q/E：升降 · Shift：加速'
  },
  ja: {
    'photo.cameraModeLocked':'カメラモード · ローバー固定',
    'photo.cameraModeFree':'カメラモード · フリー',
    'photo.switchFree':'フリーカメラへ',
    'photo.switchLock':'ローバーを固定',
    'photo.cameraHelpLocked':'ドラッグ：ローバー周回 · ホイール：ズーム',
    'photo.cameraHelpFree':'ドラッグ：視点 · ホイール：移動速度 · WASD：移動 · Q/E：上下 · Shift：加速'
  },
  ko: {
    'photo.cameraModeLocked':'카메라 모드 · 로버 고정',
    'photo.cameraModeFree':'카메라 모드 · 자유 카메라',
    'photo.switchFree':'자유 카메라로',
    'photo.switchLock':'로버 고정',
    'photo.cameraHelpLocked':'드래그: 로버 주회 · 휠: 줌',
    'photo.cameraHelpFree':'드래그: 시점 · 휠: 이동 속도 · WASD: 이동 · Q/E: 높이 · Shift: 가속'
  }
};
for (const [language, entries] of Object.entries(PHOTO_CAMERA_MODE_DICT)) Object.assign(DICT[language], entries);

let currentLanguage = 'en';

function normalizeLanguage(raw='') {
  const s = raw.toLowerCase();
  if (s.startsWith('zh')) return 'zh-CN';
  if (s.startsWith('ja')) return 'ja';
  if (s.startsWith('ko')) return 'ko';
  return 'en';
}

export function getLanguage() { return currentLanguage; }
export function translationKeys(lang) { return Object.keys(DICT[lang] || {}); }

export function t(key, vars = {}) {
  const table = DICT[currentLanguage] || DICT.en;
  let value = table[key] ?? DICT.en[key] ?? key;
  for (const [name, replacement] of Object.entries(vars)) value = value.replaceAll('{' + name + '}', String(replacement));
  return value;
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.documentElement.lang = currentLanguage;
  document.title = t('app.title');
}

export function setLanguage(lang, { persist = true, notify = true } = {}) {
  currentLanguage = LANGUAGES.some(x => x.code === lang) ? lang : normalizeLanguage(lang);
  if (persist) localStorage.setItem(STORAGE_KEY, currentLanguage);
  applyI18n();
  if (notify) window.dispatchEvent(new CustomEvent('lunar-language-changed', { detail: { language: currentLanguage } }));
  return currentLanguage;
}

export function initLanguage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  const initial = stored || normalizeLanguage(navigator.language || 'en');
  return setLanguage(initial, { persist: false, notify: false });
}

export function populateLanguageSelect(select) {
  if (!select) return;
  select.replaceChildren(...LANGUAGES.map(({code,label}) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = label;
    return option;
  }));
  select.value = currentLanguage;
}
