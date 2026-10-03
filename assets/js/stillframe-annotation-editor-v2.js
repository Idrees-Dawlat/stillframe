/**
 * Stillframe annotation editor, built on Fabric.js (vendor/fabric.min.js, MIT).
 *
 * Same public API as stillframe-annotation-editor.js:
 * createAnnotationEditor(wrap, image, options) and flattenImageAndMarks(image, marks).
 * Marks live in image pixels, so exports are lossless at any zoom.
 */
(function () {
	'use strict';

	var api = window.StillframeCapture || {};
	window.StillframeCapture = api;

	var fabric = window.fabric;
	if (!fabric) {
		return;
	}

	var FONT = 'Arial, Helvetica, sans-serif';
	var DEFAULT_COLOR = '#ef4444';
	var DEFAULT_SIZE = 4;
	var TOOLS = { select: 1, pen: 1, circle: 1, arrow: 1, rect: 1, highlight: 1, text: 1, step: 1, blur: 1, pixelate: 1 };
	var PROPS = ['sfType', 'sfMode', 'sfLevel', 'sfColor', 'sfSize'];
	var HISTORY_LIMIT = 100;
	var BRAND = '#005976';

	// Image the blur marks sample from. Set by the editor, and briefly by flatten().
	var blurSource = null;

	/* ---- shared helpers ---- */

	function isColor(value) {
		return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
	}

	function clamp(value, min, max) {
		return Math.min(max, Math.max(min, value));
	}

	function styleControls(obj) {
		obj.set({
			cornerStyle: 'circle',
			cornerColor: '#ffffff',
			cornerStrokeColor: BRAND,
			cornerSize: 11,
			transparentCorners: false,
			borderColor: BRAND,
			borderScaleFactor: 1.5,
			padding: 2,
			strokeUniform: true
		});
		return obj;
	}

	/* Blur and pixelate: a rectangle that paints a processed copy of the image beneath it. */
	function blurRender(ctx) {
		var src = blurSource;
		var w = this.width;
		var h = this.height;
		var sw = Math.abs(w * this.scaleX);
		var sh = Math.abs(h * this.scaleY);
		if (!src || sw < 2 || sh < 2) {
			return;
		}
		var level = this.sfLevel || 12;
		var x = this.left;
		var y = this.top;
		var useBlur = this.sfMode !== 'pixelate' && typeof ctx.filter === 'string';
		if (useBlur) {
			var pad = Math.ceil(level * 2);
			var big = document.createElement('canvas');
			big.width = Math.max(1, Math.round(sw + pad * 2));
			big.height = Math.max(1, Math.round(sh + pad * 2));
			var bctx = big.getContext('2d');
			bctx.filter = 'blur(' + level + 'px)';
			bctx.drawImage(src, x - pad, y - pad, sw + pad * 2, sh + pad * 2, 0, 0, big.width, big.height);
			ctx.drawImage(big, pad, pad, sw, sh, -w / 2, -h / 2, w, h);
			return;
		}
		var block = Math.max(4, level * 1.2);
		var tw = Math.max(1, Math.round(sw / block));
		var th = Math.max(1, Math.round(sh / block));
		var tmp = document.createElement('canvas');
		tmp.width = tw;
		tmp.height = th;
		tmp.getContext('2d').drawImage(src, x, y, sw, sh, 0, 0, tw, th);
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(tmp, 0, 0, tw, th, -w / 2, -h / 2, w, h);
	}

	/* ---- object factories ---- */

	function makeArrow(x1, y1, x2, y2, color, sw) {
		var dx = x2 - x1;
		var dy = y2 - y1;
		var length = Math.sqrt(dx * dx + dy * dy);
		if (length < 1) {
			return null;
		}
		var ux = dx / length;
		var uy = dy / length;
		var head = Math.min(length * 0.7, Math.max(sw * 4.6, 16));
		var bx = x2 - ux * head;
		var by = y2 - uy * head;
		var line = new fabric.Line([x1, y1, bx + ux * head * 0.25, by + uy * head * 0.25], {
			stroke: color,
			strokeWidth: sw,
			strokeLineCap: 'round',
			selectable: false
		});
		var tri = new fabric.Triangle({
			width: head * 0.84,
			height: head,
			fill: color,
			originX: 'center',
			originY: 'center',
			left: x2 - ux * head / 2,
			top: y2 - uy * head / 2,
			angle: Math.atan2(dy, dx) * 180 / Math.PI + 90,
			selectable: false
		});
		var group = new fabric.Group([line, tri], { sfType: 'arrow', sfColor: color, sfSize: sw, lockUniScaling: true });
		return styleControls(group);
	}

	function makeStep(x, y, n, color, radius, unit) {
		var circle = new fabric.Circle({
			radius: radius,
			fill: color,
			stroke: '#ffffff',
			strokeWidth: 2 * unit,
			originX: 'center',
			originY: 'center'
		});
		var label = new fabric.FabricText(String(n), {
			fontFamily: FONT,
			fontWeight: '700',
			fontSize: Math.round(radius * 1.15),
			fill: '#ffffff',
			originX: 'center',
			originY: 'center'
		});
		var group = new fabric.Group([circle, label], {
			left: x,
			top: y,
			originX: 'center',
			originY: 'center',
			sfType: 'step',
			lockUniScaling: true
		});
		group.setControlsVisibility({ mtr: false });
		return styleControls(group);
	}

	function makeText(x, y, color, fontSize, width) {
		var text = new fabric.Textbox('Text', {
			left: x,
			top: y,
			width: width,
			splitByGrapheme: false,
			fontFamily: FONT,
			fontWeight: '700',
			fontSize: fontSize,
			fill: color,
			stroke: 'rgba(255,255,255,0.95)',
			strokeWidth: Math.max(2, fontSize / 6),
			paintFirst: 'stroke',
			sfType: 'text'
		});
		return styleControls(text);
	}

	/* Re-attach behaviour that does not survive serialization. */
	function decorate(obj) {
		styleControls(obj);
		if (obj.sfType === 'blur') {
			obj._render = blurRender;
			obj.set({ lockRotation: true, objectCaching: false });
			obj.setControlsVisibility({ mtr: false });
		} else if (obj.sfType === 'highlight') {
			obj.set({ globalCompositeOperation: 'multiply' });
		} else if (obj.sfType === 'step') {
			obj.setControlsVisibility({ mtr: false });
		}
		return obj;
	}

	function validMarks(list) {
		return (Array.isArray(list) ? list : []).filter(function (item) {
			return item && typeof item === 'object' && typeof item.sfType === 'string' && typeof item.type === 'string';
		});
	}

	function enliven(list) {
		var valid = validMarks(list);
		if (!valid.length) {
			return Promise.resolve([]);
		}
		return fabric.util.enlivenObjects(JSON.parse(JSON.stringify(valid))).then(function (objects) {
			return objects.map(decorate);
		});
	}

	/* ---- export ---- */

	api.flattenImageAndMarks = function (image, marksList) {
		return new Promise(function (resolve, reject) {
			if (!image || !image.naturalWidth || !image.naturalHeight) {
				reject(new Error('image'));
				return;
			}
			var nw = image.naturalWidth;
			var nh = image.naturalHeight;
			var sc = new fabric.StaticCanvas(undefined, {
				width: nw,
				height: nh,
				enableRetinaScaling: false,
				renderOnAddRemove: false
			});
			enliven(marksList).then(function (objects) {
				var previous = blurSource;
				blurSource = image;
				try {
					sc.backgroundImage = new fabric.FabricImage(image);
					objects.forEach(function (obj) {
						sc.add(obj);
					});
					sc.renderAll();
				} finally {
					blurSource = previous;
				}
				sc.getElement().toBlob(function (blob) {
					sc.dispose();
					if (!blob) {
						reject(new Error('blob'));
						return;
					}
					resolve(blob);
				}, 'image/png');
			}).catch(function (error) {
				sc.dispose();
				reject(error);
			});
		});
	};

	/* ---- the editor ---- */

	api.createAnnotationEditor = function (wrap, image, options) {
		var settings = options || {};
		var tool = 'pen';
		var color = DEFAULT_COLOR;
		var size = DEFAULT_SIZE;
		var history = [];
		var future = [];
		var lastState = '[]';
		var restoring = false;
		var drawing = null;
		var observer = null;

		var el = document.createElement('canvas');
		el.className = 'stillframe-annotation-fabric';
		wrap.appendChild(el);

		var canvas = new fabric.Canvas(el, {
			selection: false,
			preserveObjectStacking: true,
			enableRetinaScaling: true,
			stopContextMenu: true,
			fireRightClick: false
		});
		canvas.wrapperEl.className += ' stillframe-annotation-wrapper';
		canvas.wrapperEl.style.position = 'absolute';
		blurSource = image;

		function notify() {
			if (typeof settings.onChange === 'function') {
				settings.onChange();
			}
		}

		function unit() {
			return 1 / (canvas.getZoom() || 1);
		}

		function sceneSize() {
			return { w: image.naturalWidth || 1, h: image.naturalHeight || 1 };
		}

		function serialize() {
			return canvas.toObject(PROPS).objects;
		}

		// Record the state before a change, so undo can return to it.
		function commit() {
			if (restoring) {
				return;
			}
			var now = JSON.stringify(serialize());
			if (now === lastState) {
				return;
			}
			history.push(lastState);
			if (history.length > HISTORY_LIMIT) {
				history.shift();
			}
			future = [];
			lastState = now;
			notify();
		}

		function restore(json) {
			restoring = true;
			canvas.discardActiveObject();
			return enliven(JSON.parse(json)).then(function (objects) {
				canvas.remove.apply(canvas, canvas.getObjects());
				objects.forEach(function (obj) {
					canvas.add(obj);
				});
				renumberSteps();
				lastState = JSON.stringify(serialize());
				restoring = false;
				canvas.requestRenderAll();
				notify();
			}).catch(function () {
				restoring = false;
			});
		}

		function renumberSteps() {
			var n = 0;
			canvas.getObjects().forEach(function (obj) {
				if (obj.sfType === 'step') {
					n += 1;
					var label = obj.getObjects()[1];
					if (label && label.text !== String(n)) {
						label.set('text', String(n));
						obj.setCoords();
						obj.dirty = true;
					}
				}
			});
		}

		function resizeCanvas() {
			var rect = image.getBoundingClientRect();
			var scene = sceneSize();
			var width = Math.max(1, Math.round(rect.width));
			var height = Math.max(1, Math.round(rect.height));
			canvas.wrapperEl.style.left = image.offsetLeft + 'px';
			canvas.wrapperEl.style.top = image.offsetTop + 'px';
			canvas.setDimensions({ width: width, height: height });
			canvas.setZoom(width / scene.w);
			canvas.requestRenderAll();
		}

		function activeObjects() {
			var active = canvas.getActiveObject();
			if (!active) {
				return [];
			}
			return active.type === 'activeselection' ? active.getObjects() : [active];
		}

		function isEditingText() {
			var active = canvas.getActiveObject();
			return !!(active && active.isEditing);
		}

		function setToolInternal(next) {
			tool = next;
			var mode = next === 'select';
			canvas.isDrawingMode = next === 'pen';
			canvas.selection = mode;
			canvas.skipTargetFind = !mode;
			canvas.defaultCursor = mode ? 'default' : 'crosshair';
			canvas.hoverCursor = mode ? 'move' : 'crosshair';
			if (!mode) {
				canvas.discardActiveObject();
			}
			if (next === 'pen') {
				var brush = new fabric.PencilBrush(canvas);
				brush.color = color;
				brush.width = size * unit();
				brush.strokeLineCap = 'round';
				brush.strokeLineJoin = 'round';
				canvas.freeDrawingBrush = brush;
			}
			canvas.requestRenderAll();
		}

		// After placing a mark, switch to Select so it can be moved or resized straight away.
		function selectAfter(obj) {
			setToolInternal('select');
			if (typeof settings.onToolChange === 'function') {
				settings.onToolChange('select');
			}
			if (obj && canvas.contains(obj)) {
				canvas.setActiveObject(obj);
			}
			canvas.requestRenderAll();
		}

		function scenePoint(event) {
			var scene = sceneSize();
			var p = canvas.getScenePoint(event);
			return { x: clamp(p.x, 0, scene.w), y: clamp(p.y, 0, scene.h) };
		}

		function constrainPoint(start, p, shape, shift) {
			if (!shift) {
				return p;
			}
			var dx = p.x - start.x;
			var dy = p.y - start.y;
			if (shape === 'arrow') {
				var len = Math.sqrt(dx * dx + dy * dy);
				var angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
				return { x: start.x + Math.cos(angle) * len, y: start.y + Math.sin(angle) * len };
			}
			var side = Math.max(Math.abs(dx), Math.abs(dy));
			return { x: start.x + (dx < 0 ? -side : side), y: start.y + (dy < 0 ? -side : side) };
		}

		function colorFor(type) {
			return type === 'blur' ? '#000000' : color;
		}

		function createShape(type, p) {
			var sw = size * unit();
			var obj;
			if (type === 'rect') {
				obj = new fabric.Rect({ left: p.x, top: p.y, width: 1, height: 1, fill: 'rgba(0,0,0,0)', stroke: color, strokeWidth: sw, strokeLineJoin: 'miter', sfType: 'rect' });
			} else if (type === 'circle') {
				obj = new fabric.Ellipse({ left: p.x, top: p.y, rx: 0.5, ry: 0.5, fill: 'rgba(0,0,0,0)', stroke: color, strokeWidth: sw, sfType: 'circle' });
			} else if (type === 'highlight') {
				obj = new fabric.Rect({ left: p.x, top: p.y, width: 1, height: 1, fill: color, opacity: 0.35, strokeWidth: 0, globalCompositeOperation: 'multiply', sfType: 'highlight' });
			} else {
				obj = new fabric.Rect({
					left: p.x,
					top: p.y,
					width: 1,
					height: 1,
					fill: 'rgba(0,0,0,0)',
					strokeWidth: 0,
					sfType: 'blur',
					sfMode: type === 'pixelate' ? 'pixelate' : 'blur',
					sfLevel: Math.round(size * 3 * unit() + 6)
				});
			}
			obj.set({ selectable: true });
			return decorate(obj);
		}

		function updateShape(d, p) {
			var x = Math.min(d.start.x, p.x);
			var y = Math.min(d.start.y, p.y);
			var w = Math.abs(p.x - d.start.x);
			var h = Math.abs(p.y - d.start.y);
			if (d.type === 'arrow') {
				if (d.obj) {
					canvas.remove(d.obj);
				}
				d.obj = makeArrow(d.start.x, d.start.y, p.x, p.y, color, size * unit());
				if (d.obj) {
					canvas.add(d.obj);
				}
				return;
			}
			if (d.type === 'circle') {
				d.obj.set({ left: x, top: y, rx: Math.max(w / 2, 0.5), ry: Math.max(h / 2, 0.5) });
			} else {
				d.obj.set({ left: x, top: y, width: Math.max(w, 1), height: Math.max(h, 1) });
			}
			d.obj.setCoords();
		}

		canvas.on('mouse:down', function (opt) {
			if (tool === 'select' || tool === 'pen' || isEditingText()) {
				return;
			}
			var p = scenePoint(opt.e);
			if (tool === 'step') {
				var n = canvas.getObjects().filter(function (o) { return o.sfType === 'step'; }).length + 1;
				var step = makeStep(p.x, p.y, n, color, (9 + size * 1.5) * unit(), unit());
				restoring = true;
				canvas.add(step);
				restoring = false;
				commit();
				return;
			}
			if (tool === 'text') {
				var text = makeText(p.x, p.y, color, (12 + size * 2.5) * unit(), 320 * unit());
				text.on('editing:entered', function () {
					if (text.hiddenTextarea) {
						text.hiddenTextarea.classList.add('stillframe-text-input');
					}
				});
				text.on('editing:exited', function () {
					if (!String(text.text || '').trim()) {
						restoring = true;
						canvas.remove(text);
						restoring = false;
					}
					commit();
					selectAfter(text);
				});
				restoring = true;
				canvas.add(text);
				restoring = false;
				canvas.setActiveObject(text);
				text.enterEditing();
				text.selectAll();
				return;
			}
			drawing = { type: tool, start: p, obj: null, moved: false };
			if (tool !== 'arrow') {
				drawing.obj = createShape(tool, p);
				restoring = true;
				canvas.add(drawing.obj);
				restoring = false;
			}
		});

		canvas.on('mouse:move', function (opt) {
			if (!drawing) {
				return;
			}
			var p = constrainPoint(drawing.start, scenePoint(opt.e), drawing.type, opt.e.shiftKey);
			if (Math.abs(p.x - drawing.start.x) + Math.abs(p.y - drawing.start.y) > 3 * unit()) {
				drawing.moved = true;
			}
			restoring = true;
			updateShape(drawing, p);
			restoring = false;
			canvas.requestRenderAll();
		});

		canvas.on('mouse:up', function () {
			if (!drawing) {
				return;
			}
			var d = drawing;
			drawing = null;
			if (!d.moved) {
				if (d.obj) {
					restoring = true;
					canvas.remove(d.obj);
					restoring = false;
				}
				canvas.requestRenderAll();
				return;
			}
			if (d.obj) {
				d.obj.setCoords();
			}
			commit();
			selectAfter(d.obj);
		});

		canvas.on('path:created', function (opt) {
			if (opt.path) {
				opt.path.set({ sfType: 'pen', sfColor: color, sfSize: size, selectable: true });
				styleControls(opt.path);
			}
			commit();
		});
		// Resizing text with a corner handle changes its size and box, never a stretched scale.
		canvas.on('object:modified', function (opt) {
			var t = opt && opt.target;
			if (t && t.sfType === 'text' && (t.scaleX !== 1 || t.scaleY !== 1)) {
				var k = t.scaleX;
				t.set({ fontSize: t.fontSize * k, width: t.width * k, strokeWidth: Math.max(2, t.fontSize * k / 6), scaleX: 1, scaleY: 1 });
				t.setCoords();
			}
			commit();
		});

		function onKeyNudge(event) {
			var step = event.shiftKey ? 10 : 1;
			var dx = event.key === 'ArrowLeft' ? -step : (event.key === 'ArrowRight' ? step : 0);
			var dy = event.key === 'ArrowUp' ? -step : (event.key === 'ArrowDown' ? step : 0);
			if ((!dx && !dy) || isEditingText() || !canvas.getActiveObject()) {
				return;
			}
			var tag = event.target && event.target.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
				return;
			}
			event.preventDefault();
			var active = canvas.getActiveObject();
			active.set({ left: active.left + dx * unit(), top: active.top + dy * unit() });
			active.setCoords();
			canvas.requestRenderAll();
			commit();
		}
		document.addEventListener('keydown', onKeyNudge);

		if (typeof window.ResizeObserver === 'function') {
			observer = new window.ResizeObserver(function () {
				resizeCanvas();
			});
			observer.observe(image);
		}
		window.addEventListener('resize', resizeCanvas);
		window.requestAnimationFrame(resizeCanvas);
		setToolInternal('pen');

		function applyToActive(fn) {
			var changed = false;
			activeObjects().forEach(function (obj) {
				if (fn(obj)) {
					obj.dirty = true;
					changed = true;
				}
			});
			if (changed) {
				canvas.requestRenderAll();
				commit();
			}
		}

		return {
			setTool: function (next) {
				if (TOOLS[next]) {
					setToolInternal(next);
				}
			},
			setColor: function (next) {
				if (!isColor(next)) {
					return;
				}
				color = next;
				if (canvas.freeDrawingBrush) {
					canvas.freeDrawingBrush.color = next;
				}
				applyToActive(function (obj) {
					var type = obj.sfType;
					if (type === 'blur') {
						return false;
					}
					obj.sfColor = next;
					if (type === 'arrow') {
						obj.getObjects()[0].set('stroke', next);
						obj.getObjects()[1].set('fill', next);
					} else if (type === 'step') {
						obj.getObjects()[0].set('fill', next);
					} else if (type === 'text' || type === 'highlight') {
						obj.set('fill', next);
					} else {
						obj.set('stroke', next);
					}
					return true;
				});
			},
			setSize: function (next) {
				var value = parseFloat(next);
				if (!(value > 0 && value <= 16)) {
					return;
				}
				size = value;
				if (canvas.freeDrawingBrush) {
					canvas.freeDrawingBrush.width = value * unit();
				}
				applyToActive(function (obj) {
					var type = obj.sfType;
					if (type === 'rect' || type === 'circle' || type === 'pen') {
						obj.set('strokeWidth', value * unit());
						return true;
					}
					if (type === 'text') {
						var fs = (12 + value * 2.5) * unit();
						obj.set({ fontSize: fs, strokeWidth: Math.max(2, fs / 6) });
						return true;
					}
					if (type === 'blur') {
						obj.set('sfLevel', Math.round(value * 3 * unit() + 6));
						return true;
					}
					return false;
				});
			},
			undo: function () {
				if (!history.length || isEditingText()) {
					return;
				}
				future.push(lastState);
				var previous = history.pop();
				restore(previous);
			},
			redo: function () {
				if (!future.length || isEditingText()) {
					return;
				}
				history.push(lastState);
				var next = future.pop();
				restore(next);
			},
			clear: function () {
				if (!canvas.getObjects().length) {
					return;
				}
				canvas.discardActiveObject();
				canvas.remove.apply(canvas, canvas.getObjects());
				commit();
				canvas.requestRenderAll();
			},
			selectAll: function () {
				var objects = canvas.getObjects();
				if (!objects.length || isEditingText()) {
					return false;
				}
				setToolInternal('select');
				if (typeof settings.onToolChange === 'function') {
					settings.onToolChange('select');
				}
				canvas.discardActiveObject();
				if (objects.length === 1) {
					canvas.setActiveObject(objects[0]);
				} else {
					canvas.setActiveObject(new fabric.ActiveSelection(objects, { canvas: canvas }));
				}
				canvas.requestRenderAll();
				return true;
			},
			deleteSelected: function () {
				var active = activeObjects();
				if (!active.length || isEditingText()) {
					return false;
				}
				canvas.discardActiveObject();
				active.forEach(function (obj) {
					canvas.remove(obj);
				});
				renumberSteps();
				commit();
				canvas.requestRenderAll();
				return true;
			},
			clearSelection: function () {
				if (!canvas.getActiveObject()) {
					return false;
				}
				canvas.discardActiveObject();
				canvas.requestRenderAll();
				return true;
			},
			hasMarks: function () {
				return canvas.getObjects().length > 0;
			},
			getMarks: function () {
				return serialize();
			},
			setMarks: function (newMarks) {
				history = [];
				future = [];
				return restore(JSON.stringify(validMarks(newMarks)));
			},
			// For tests and debugging only.
			getCanvas: function () {
				return canvas;
			},
			flatten: function () {
				return api.flattenImageAndMarks(image, serialize());
			},
			destroy: function () {
				document.removeEventListener('keydown', onKeyNudge);
				window.removeEventListener('resize', resizeCanvas);
				if (observer) {
					observer.disconnect();
					observer = null;
				}
				if (blurSource === image) {
					blurSource = null;
				}
				canvas.dispose();
				if (canvas.wrapperEl && canvas.wrapperEl.parentNode) {
					canvas.wrapperEl.parentNode.removeChild(canvas.wrapperEl);
				}
				history = [];
				future = [];
			}
		};
	};
})();
