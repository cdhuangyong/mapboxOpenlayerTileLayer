function OpenlayerTileLayer(options){
	this.width = options.width;
	this.height = options.height;
	this.tileOptions = options.tileOptions;
	this.id = options.id;
	this.olmap = this.createOlMap();
	this.customLayer = this.createCustomLayer();
}
OpenlayerTileLayer.prototype = {
	constructor:OpenlayerTileLayer,
	addToMap:function(map){
		var _this = this;
		this.map = map;
		this.updatePosition();
		this.map.addLayer(this.customLayer);
		this.map.on("move",function(){
			_this.updatePosition();
		});
		return this;
	},
	updatePosition(){
		var center = this.map.getCenter().toArray();
		var center3857 = ol.proj.transform(center,"EPSG:4326","EPSG:3857");
		this.olmap.getView().setCenter(center3857);
		this.olmap.getView().setZoom(this.map.getZoom() + 1);
	},
	getImageExtent(){
		var olmap = this.olmap;
		var size = [this.width,this.height];
		var extent = olmap.getView().calculateExtent(size);
		var extent = ol.proj.transformExtent(extent,"EPSG:3857","EPSG:4326");
		return extent;
	},
	createOlMap:function(){
		var _this = this;
		var width = this.width,height= this.height;
		var container = document.createElement("div");
		var map = this.olmap = new ol.Map({
			target:container,
			view:new ol.View({
				projection:"EPSG:3857",
				center:[0, 0],
				zoom:10
			})
		});
		map.interactions.clear();
		map.controls.clear();
		map.setSize([width,height]);
		window.removeEventListener("resize",this.olmap.handleResize_);
		var tileLayer = new ol.layer.Tile({
			source:new ol.source.XYZ(this.tileOptions)
		});
		tileLayer.on("postcompose",function(){
			_this.map.triggerRepaint();
		});
		map.addLayer(tileLayer);
		return map;
	},
	createCustomLayer:function(){
		var _this = this;
		var olmap = this.olmap;
		return {
			id: this.id || 'tileLayer',
			type:"custom",
			onAdd:function(map,gl){
				var vertexShaderSource = `
					attribute vec4 a_Position;
					attribute vec2 uv;
					uniform mat4 u_matrix;
					varying vec2 v_uv;
					void main (){
						v_uv = uv;
						gl_Position = u_matrix * a_Position;
					}
				`;
				var fragmentShaderSource = `
					#ifdef GL_ES
					precision mediump float;
				  	#endif
				  	varying vec2 v_uv;
				  	uniform sampler2D texture;
					void main(){
						vec4 textureColor = texture2D(texture,v_uv);
						gl_FragColor = textureColor;
					}
				`;
				this.map = map;
				this.gl = gl;
				//创建着色器程序
				var vertexShader = this.vertexShader = gl.createShader(gl.VERTEX_SHADER);
				gl.shaderSource (vertexShader,vertexShaderSource);
				gl.compileShader (vertexShader);
				//获取错误信息
				if(!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)){
					console.log(gl.getShaderInfoLog(vertexShader));
					gl.deleteShader(vertexShader);
					return ;
				}
				var fragmentShader = this.fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
				gl.shaderSource(fragmentShader,fragmentShaderSource);
				gl.compileShader(fragmentShader);
				//获取错误信息
				if(!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)){
					console.log(gl.getShaderInfoLog(fragmentShader));
					gl.deleteShader(fragmentShader);
					return;
				}
				this.program = gl.createProgram();
				gl.attachShader(this.program, vertexShader);
				gl.attachShader(this.program, fragmentShader);
				gl.linkProgram(this.program);
				if(!gl.getProgramParameter(this.program,gl.LINK_STATUS)){
					console.log(gl.getProgramInfoLog(this.program));
					gl.deleteProgram(this.program);
					return;
				}
				this.matrixLocation = gl.getUniformLocation(this.program, "u_matrix");
				this.uvPosition = gl.getAttribLocation(this.program, "uv");
				this.texLocation = gl.getUniformLocation(this.program, 'texture');

				this.positionLocation = gl.getAttribLocation(this.program, "a_Position");
				this.positionBuffer = gl.createBuffer();
				this.positionBufferData = new Float32Array( 6 * 4 );

				var texture = gl.createTexture();
				this.texture = texture;

			    this.uvBuffer = gl.createBuffer();
				gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
				gl.bufferData(gl.ARRAY_BUFFER,
					new Float32Array([0,0,0,1,1,0,1,0,0,1,1,1]),
					gl.STATIC_DRAW
				);
			},
			render:function(gl,matrix){
				gl.useProgram(this.program);
				var data = this.positionBufferData;

				var extent = _this.getImageExtent();

				var bl = mapboxgl.MercatorCoordinate.fromLngLat([extent[0],extent[1]]);
				var tr = mapboxgl.MercatorCoordinate.fromLngLat([extent[2],extent[3]]);

				data[0] = bl.x; data[1] = tr.y;data[2] = 0;data[3] = 1;
				data[4] = bl.x;data[5] = bl.y;data[6] = 0;data[7] = 1;
				data[8] = tr.x;data[9] = tr.y;data[10] = 0;data[11] = 1;
				data[12] = tr.x;data[13] = tr.y;data[14] = 0;data[15] = 1;
				data[16] = bl.x;data[17] = bl.y;data[18] = 0;data[19] = 1;
				data[20] = tr.x;data[21] = bl.y;data[22] = 0;data[23] = 1;
				
				gl.uniformMatrix4fv(this.matrixLocation, false, matrix);

				gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
				gl.bufferData(gl.ARRAY_BUFFER,this.positionBufferData, gl.STATIC_DRAW);
				gl.enableVertexAttribArray(this.positionLocation);
				gl.vertexAttribPointer(this.positionLocation, 4, gl.FLOAT, false, 0, 0);

				gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
				gl.enableVertexAttribArray(this.uvPosition);
				gl.vertexAttribPointer(this.uvPosition, 2, gl.FLOAT, false, 0, 0);

				gl.activeTexture(gl.TEXTURE0);
			    gl.bindTexture(gl.TEXTURE_2D, this.texture);
			    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			    gl.uniform1i(this.texLocation, 0);
			    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,olmap.getTargetElement().getElementsByTagName("canvas")[0]);

				gl.enable(gl.BLEND);
				//gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
				gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
				gl.drawArrays(gl.TRIANGLES,0,6);
			}
		};
	},
	remove(){
		this.olmap.setTarget(null);
		this.map.removeLayer(this.id);
	}
};