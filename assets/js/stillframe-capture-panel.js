(function () {
	'use strict';

	var api = window.StillframeCapture || {};
	window.StillframeCapture = api;

	var config = api.config || {};
	var session = 0;
	var panel = null;
	var dialog = null;
	var frame = null;
	var editor = null;
	var objectUrl = '';
	var returnFocus = null;
	var captured = null;
	var statusNode = null;
	var customButton = null;
	var customInput = null;
	var captureButton = null;
	var windowButton = null;
	var downloadButton = null;
	var undoButton = null;
	var clearButton = null;
	var penButton = null;
	var editorSection = null;
	var canvasWrap = null;
	var keyHandler = null;
	var focusHandler = null;

	function text(key) {
		var value = config.i18n && config.i18n[key] ? String(config.i18n[key]) : '';
		return value
			.replace(/&quot;/g, '"')
			.replace(/&#039;/g, "'")
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&');
	}

	function element(tag, attrs) {
		var node = document.createElement(tag);
		if (!attrs) {
			return node;
		}
		Object.keys(attrs).forEach(function (key) {
			if (key === 'text') {
				node.textContent = attrs[key];
				return;
			}
			if (key === 'className') {
				node.className = attrs[key];
				return;
			}
			node.setAttribute(key, attrs[key]);
		});
		return node;
	}

	function setStatus(message) {
		if (statusNode) {
			statusNode.textContent = message || '';
		}
	}

	function removeFrame() {
		if (frame && frame.parentNode) {
			frame.parentNode.removeChild(frame);
		}
		frame = null;
	}

	function focusMenu() {
		var node = returnFocus;
		if (!node || !node.isConnected) {
			var item = document.getElementById('wp-admin-bar-stillframe-capture');
			node = item ? item.querySelector('a') : null;
		}
		if (node && typeof node.focus === 'function') {
			node.focus();
		}
	}

	function isVisible(node) {
		if (!node || node.disabled || node.hidden) {
			return false;
		}
		var current = node;
		while (current && current !== dialog) {
			if (current.hidden) {
				return false;
			}
			current = current.parentElement;
		}
		var style = window.getComputedStyle(node);
		return style.display !== 'none' && style.visibility !== 'hidden';
	}

	function focusable() {
		if (!dialog) {
			return [];
		}
		var selector = 'button, input, a[href], select, textarea, [tabindex]:not([tabindex="-1"])';
		return Array.prototype.filter.call(dialog.querySelectorAll(selector), isVisible);
	}

	function slugFromPath(urlString) {
		var path = '';
		try {
			path = new URL(urlString, window.location.href).pathname || '';
		} catch (error) {
			path = window.location.pathname || '';
		}
		var slug = path.toLowerCase().replace(/[^a-z0-9-]/g, '');
		if (!slug) {
			slug = 'screen';
		}
		if (slug.length > 80) {
			slug = slug.slice(0, 80);
		}
		return slug;
	}

	function fileNameFor(urlString, width, scale) {
		return 'stillframe-' + slugFromPath(urlString) + '-' + String(width) + 'w-' + String(scale) + 'x.png';
	}

	function formatCaptured(width, scale) {
		return text('captured')
			.replace('%1$d', String(width))
			.replace('%2$d', String(scale));
	}

	function captureTargetUrl() {
		var current = new URL(window.location.href);
		var target;
		try {
			target = new URL(String(config.currentUrl || current.href), current.href);
		} catch (error) {
			target = new URL(current.href);
		}
		if (target.origin !== current.origin) {
			target = new URL(current.href);
		}
		var strip = Array.isArray(config.stripArgs) && config.stripArgs.length
			? config.stripArgs
			: ['action', '_wpnonce', 'nonce', '_wp_http_referer', 'wp_customize'];
		strip.forEach(function (key) {
			target.searchParams.delete(String(key));
		});
		target.hash = '';
		return target.toString();
	}

	function readScale() {
		if (!panel) {
			return 2;
		}
		var pressed = panel.querySelector('.stillframe-scale-choice[aria-pressed="true"]');
		var scale = pressed ? parseInt(pressed.getAttribute('data-scale'), 10) : 2;
		if (scale !== 1 && scale !== 2 && scale !== 3) {
			return 2;
		}
		return scale;
	}

	function readWidth() {
		if (!panel || !customButton) {
			return null;
		}
		var min = Number(config.minWidth) || 320;
		var max = Number(config.maxWidth) || 2560;
		if (customButton.getAttribute('aria-pressed') === 'true') {
			var raw = customInput.value.trim();
			if (!/^\d+$/.test(raw)) {
				return null;
			}
			var customWidth = parseInt(raw, 10);
			if (customWidth < min || customWidth > max) {
				return null;
			}
			return customWidth;
		}
		var pressed = panel.querySelector('.stillframe-width-preset[aria-pressed="true"]');
		if (!pressed) {
			return null;
		}
		var width = parseInt(pressed.getAttribute('data-width'), 10);
		if (!width || width < min || width > max) {
			return null;
		}
		return width;
	}

	function syncMarkButtons() {
		var hasMarks = !!(editor && editor.hasMarks());
		if (undoButton) {
			undoButton.disabled = !hasMarks;
		}
		if (clearButton) {
			clearButton.disabled = !hasMarks;
		}
	}

	function setBusy(busy) {
		if (!dialog) {
			return;
		}
		dialog.setAttribute('aria-busy', busy ? 'true' : 'false');
		if (captureButton) {
			captureButton.disabled = busy;
		}
		if (windowButton) {
			windowButton.disabled = busy;
		}
		if (downloadButton) {
			downloadButton.disabled = busy || !editor;
		}
		if (customButton) {
			customButton.disabled = busy;
		}
		if (customInput) {
			customInput.disabled = busy || customButton.getAttribute('aria-pressed') !== 'true';
		}
		if (panel) {
			Array.prototype.forEach.call(panel.querySelectorAll('.stillframe-width-preset, .stillframe-scale-choice, .stillframe-tool'), function (button) {
				button.disabled = busy;
			});
		}
		if (!busy) {
			syncMarkButtons();
		} else {
			if (undoButton) {
				undoButton.disabled = true;
			}
			if (clearButton) {
				clearButton.disabled = true;
			}
		}
	}

	function clearWrap() {
		if (!canvasWrap) {
			return;
		}
		while (canvasWrap.firstChild) {
			canvasWrap.removeChild(canvasWrap.firstChild);
		}
	}

	function mountEditor(image) {
		if (editor) {
			editor.destroy();
			editor = null;
		}
		clearWrap();
		canvasWrap.appendChild(image);
		if (typeof api.createAnnotationEditor !== 'function') {
			setStatus(text('libraryMissing'));
			return;
		}
		editor = api.createAnnotationEditor(canvasWrap, image, {
			onChange: syncMarkButtons
		});
		editor.setTool('pen');
		if (panel) {
			Array.prototype.forEach.call(panel.querySelectorAll('.stillframe-tool'), function (button) {
				button.setAttribute('aria-pressed', button === penButton ? 'true' : 'false');
			});
		}
		syncMarkButtons();
		if (editorSection) {
			editorSection.hidden = false;
		}
		if (downloadButton) {
			downloadButton.disabled = false;
		}
	}

	function showImage(blob, width, scale, sourceUrl) {
		if (objectUrl) {
			URL.revokeObjectURL(objectUrl);
			objectUrl = '';
		}
		objectUrl = URL.createObjectURL(blob);
		captured = {
			width: width,
			scale: scale,
			url: sourceUrl
		};
		var image = new Image();
		image.alt = text('capturedAlt');
		image.draggable = false;
		image.style.width = width + 'px';
		image.style.maxWidth = '100%';
		image.style.height = 'auto';
		image.onload = function () {
			if (!panel) {
				return;
			}
			mountEditor(image);
			setBusy(false);
			setStatus(formatCaptured(width, scale));
			if (penButton) {
				penButton.focus();
			}
		};
		image.onerror = function () {
			setBusy(false);
			setStatus(text('captureFailed'));
		};
		image.src = objectUrl;
	}

	function saveBlob(blob, name) {
		var url = URL.createObjectURL(blob);
		var link = element('a', {
			href: url,
			download: name,
			rel: 'noopener'
		});
		link.style.display = 'none';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		window.setTimeout(function () {
			URL.revokeObjectURL(url);
		}, 4000);
	}

	function frameState(local) {
		try {
			var doc = local.contentDocument;
			var view = local.contentWindow;
			if (!doc || !view) {
				return 'blocked';
			}
			var href = String(view.location.href || '');
			if (!href || href === 'about:blank') {
				return 'blank';
			}
			if (view.location.origin !== window.location.origin) {
				return 'blocked';
			}
			if (!doc.documentElement || !doc.body) {
				return 'blank';
			}
			return 'ready';
		} catch (error) {
			return 'blocked';
		}
	}

	function canReadFrame(local) {
		return frameState(local) === 'ready';
	}

	function nextFrames(count) {
		return new Promise(function (resolve) {
			function step(left) {
				if (left <= 0) {
					resolve();
					return;
				}
				window.requestAnimationFrame(function () {
					step(left - 1);
				});
			}
			step(count);
		});
	}

	function measureHeight(doc) {
		var body = doc.body;
		var html = doc.documentElement;
		return Math.max(
			1,
			Math.ceil(Math.max(
				body ? body.scrollHeight : 0,
				body ? body.offsetHeight : 0,
				html ? html.scrollHeight : 0,
				html ? html.offsetHeight : 0
			))
		);
	}

	function waitForReady(doc) {
		var ready = Promise.resolve();
		try {
			if (doc.fonts && doc.fonts.ready) {
				ready = doc.fonts.ready.catch(function () {
					return null;
				});
			}
		} catch (error) {
			ready = Promise.resolve();
		}
		return ready.then(function () {
			return nextFrames(1);
		});
	}

	function isBlockedError(error) {
		return !!(error && (error.name === 'SecurityError' || error.code === 'blocked'));
	}

	function shoot(node, scale) {
		if (!window.modernScreenshot || typeof window.modernScreenshot.domToBlob !== 'function') {
			var missing = new Error('library');
			missing.code = 'library';
			return Promise.reject(missing);
		}
		try {
			return window.modernScreenshot.domToBlob(node, {
				scale: scale,
				backgroundColor: '#ffffff',
				maximumCanvasSize: 16384,
				timeout: 20000,
				features: {
					restoreScrollPosition: true
				},
				filter: function (nodeToKeep) {
					if (!nodeToKeep || nodeToKeep.nodeType !== 1) {
						return true;
					}
					if (nodeToKeep.id === 'wpadminbar') {
						return false;
					}
					if (nodeToKeep.classList && nodeToKeep.classList.contains('stillframe-capture-panel')) {
						return false;
					}
					if (nodeToKeep.classList && nodeToKeep.classList.contains('stillframe-capture-frame')) {
						return false;
					}
					return true;
				},
				onCloneNode: function (cloned) {
					try {
						if (!cloned || cloned.nodeType !== 1) {
							return;
						}
						if (cloned.nodeName === 'HTML' || cloned.nodeName === 'BODY') {
							cloned.style.setProperty('margin-top', '0px', 'important');
						}
					} catch (cloneError) {
						return;
					}
				}
			});
		} catch (error) {
			if (error && !error.code) {
				error.code = 'failed';
			}
			return Promise.reject(error);
		}
	}

	function prepareAndShoot(local, scale) {
		return waitForReady(local.contentDocument).then(function () {
			if (!canReadFrame(local)) {
				var blocked = new Error('blocked');
				blocked.code = 'blocked';
				throw blocked;
			}
			local.style.height = measureHeight(local.contentDocument) + 'px';
			return nextFrames(2);
		}).then(function () {
			if (!canReadFrame(local)) {
				var blocked = new Error('blocked');
				blocked.code = 'blocked';
				throw blocked;
			}
			local.style.height = measureHeight(local.contentDocument) + 'px';
			return nextFrames(1);
		}).then(function () {
			if (!canReadFrame(local)) {
				var blocked = new Error('blocked');
				blocked.code = 'blocked';
				throw blocked;
			}
			return shoot(local.contentDocument.documentElement, scale);
		});
	}

	function captureInFrame(url, width, scale, isCancelled) {
		return new Promise(function (resolve, reject) {
			var local = element('iframe', {
				className: 'stillframe-capture-frame',
				title: text('frameTitle'),
				'aria-hidden': 'true'
			});
			local.tabIndex = -1;
			local.style.position = 'fixed';
			local.style.left = '0';
			local.style.top = '0';
			local.style.width = width + 'px';
			local.style.height = '100vh';
			local.style.border = '0';
			local.style.opacity = '0';
			local.style.pointerEvents = 'none';
			local.style.zIndex = '0';
			frame = local;

			var settled = false;
			var shooting = false;
			var timer = 0;
			var blankTimer = 0;

			function stopTimer() {
				if (timer) {
					window.clearTimeout(timer);
					timer = 0;
				}
				if (blankTimer) {
					window.clearTimeout(blankTimer);
					blankTimer = 0;
				}
			}

			function finish(error, blob) {
				if (settled) {
					return;
				}
				settled = true;
				stopTimer();
				removeFrame();
				if (error) {
					reject(error);
					return;
				}
				resolve(blob);
			}

			function armTimeout(ms) {
				stopTimer();
				timer = window.setTimeout(function () {
					var error = new Error('timeout');
					error.code = 'timeout';
					finish(error);
				}, ms);
			}

			armTimeout(20000);
			local.addEventListener('load', function () {
				if (document.activeElement === local && dialog) {
					dialog.focus();
				}
				if (settled) {
					return;
				}
				if (isCancelled()) {
					var cancelled = new Error('cancelled');
					cancelled.code = 'cancelled';
					finish(cancelled);
					return;
				}
				var state = frameState(local);
				if (state === 'blank') {
					if (!blankTimer) {
						blankTimer = window.setTimeout(function () {
							blankTimer = 0;
							if (settled || shooting) {
								return;
							}
							if (frameState(local) === 'ready') {
								return;
							}
							var blankBlocked = new Error('blocked');
							blankBlocked.code = 'blocked';
							finish(blankBlocked);
						}, 2000);
					}
					return;
				}
				if (blankTimer) {
					window.clearTimeout(blankTimer);
					blankTimer = 0;
				}
				if (state === 'blocked') {
					var blocked = new Error('blocked');
					blocked.code = 'blocked';
					finish(blocked);
					return;
				}
				if (shooting) {
					return;
				}
				shooting = true;
				armTimeout(45000);
				try {
					prepareAndShoot(local, scale).then(function (blob) {
						if (isCancelled()) {
							var cancelledLater = new Error('cancelled');
							cancelledLater.code = 'cancelled';
							finish(cancelledLater);
							return;
						}
						finish(null, blob);
					}, function (error) {
						if (isBlockedError(error)) {
							error.code = 'blocked';
						} else if (!error.code) {
							error.code = 'failed';
						}
						finish(error);
					});
				} catch (error) {
					if (isBlockedError(error)) {
						error.code = 'blocked';
					} else if (!error.code) {
						error.code = 'failed';
					}
					finish(error);
				}
			});

			local.src = url;
			document.body.appendChild(local);
		});
	}

	function reportFailure(error) {
		removeFrame();
		setBusy(false);
		if (!panel) {
			return;
		}
		if (error && error.code === 'cancelled') {
			return;
		}
		if (error && error.code === 'blocked') {
			setStatus(text('frameBlocked'));
			if (windowButton) {
				windowButton.hidden = false;
				windowButton.disabled = false;
				windowButton.focus();
			}
			return;
		}
		if (error && error.code === 'timeout') {
			setStatus(text('captureTimeout'));
			return;
		}
		if (error && error.code === 'library') {
			setStatus(text('libraryMissing'));
			return;
		}
		setStatus(text('captureFailed'));
	}

	function startCapture(mode) {
		var token = session;
		var scale = readScale();
		var width = mode === 'window'
			? Math.max(1, Math.round(document.documentElement.clientWidth || window.innerWidth))
			: readWidth();
		if (mode !== 'window' && !width) {
			setStatus(text('invalidWidth'));
			if (customInput && customButton.getAttribute('aria-pressed') === 'true') {
				customInput.focus();
			}
			return;
		}
		if (windowButton && mode !== 'window') {
			windowButton.hidden = true;
		}
		setBusy(true);
		setStatus(text('capturing'));
		var sourceUrl = mode === 'window' ? window.location.href : captureTargetUrl();
		var work;
		if (mode === 'window') {
			removeFrame();
			work = shoot(document.documentElement, scale);
		} else {
			work = captureInFrame(sourceUrl, width, scale, function () {
				return token !== session;
			});
		}
		work.then(function (blob) {
			if (token !== session || !panel) {
				return;
			}
			showImage(blob, width, scale, sourceUrl);
		}).catch(function (error) {
			if (token !== session) {
				removeFrame();
				return;
			}
			reportFailure(error);
		});
	}

	function onKeydown(event) {
		if (!panel) {
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			api.closePanel();
			return;
		}
		if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z') && !event.shiftKey) {
			if (event.target && event.target.tagName === 'INPUT') {
				return;
			}
			if (editor) {
				event.preventDefault();
				editor.undo();
			}
			return;
		}
		if (event.key !== 'Tab') {
			return;
		}
		var nodes = focusable();
		if (!nodes.length) {
			event.preventDefault();
			dialog.focus();
			return;
		}
		var first = nodes[0];
		var last = nodes[nodes.length - 1];
		if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function onFocusIn(event) {
		if (!dialog || dialog.contains(event.target)) {
			return;
		}
		var nodes = focusable();
		(nodes[0] || dialog).focus();
	}

	function selectWidthButton(button) {
		Array.prototype.forEach.call(panel.querySelectorAll('.stillframe-width-preset'), function (item) {
			item.setAttribute('aria-pressed', 'false');
		});
		customButton.setAttribute('aria-pressed', 'false');
		button.setAttribute('aria-pressed', 'true');
		customInput.disabled = true;
	}

	function buildPanel() {
		var root = element('div', { className: 'stillframe-capture-panel' });
		var box = element('div', {
			className: 'stillframe-capture-panel__dialog',
			role: 'dialog',
			'aria-modal': 'true',
			'aria-labelledby': 'stillframe-capture-heading'
		});
		box.tabIndex = -1;

		var header = element('div', { className: 'stillframe-capture-panel__header' });
		var heading = element('h2', {
			id: 'stillframe-capture-heading',
			text: text('heading')
		});
		var closeButton = element('button', {
			type: 'button',
			className: 'stillframe-capture-panel__close',
			text: text('close')
		});
		closeButton.addEventListener('click', function () {
			api.closePanel();
		});
		header.appendChild(heading);
		header.appendChild(closeButton);

		var widthSet = element('fieldset');
		var widthLegend = element('legend', { text: text('width') });
		var widthChoices = element('div', { className: 'stillframe-capture-panel__choices' });
		widthSet.appendChild(widthLegend);
		widthSet.appendChild(widthChoices);

		var presets = Array.isArray(config.presets) ? config.presets : [];
		var defaultPreset = String(config.defaultPreset || 'desktop');
		var sawDefault = false;
		presets.forEach(function (preset) {
			if (!preset || !preset.id) {
				return;
			}
			var width = parseInt(preset.width, 10);
			if (!width) {
				return;
			}
			var button = element('button', {
				type: 'button',
				className: 'stillframe-width-preset',
				text: String(preset.label || width) + ' ' + String(width)
			});
			button.setAttribute('data-width', String(width));
			var pressed = preset.id === defaultPreset;
			if (pressed) {
				sawDefault = true;
			}
			button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
			button.addEventListener('click', function () {
				selectWidthButton(button);
			});
			widthChoices.appendChild(button);
		});
		if (!sawDefault) {
			var fallback = widthChoices.querySelector('.stillframe-width-preset');
			if (fallback) {
				fallback.setAttribute('aria-pressed', 'true');
			}
		}

		customButton = element('button', {
			type: 'button',
			className: 'stillframe-width-preset',
			text: text('custom')
		});
		customButton.setAttribute('aria-pressed', 'false');
		customButton.addEventListener('click', function () {
			Array.prototype.forEach.call(widthChoices.querySelectorAll('.stillframe-width-preset'), function (item) {
				item.setAttribute('aria-pressed', 'false');
			});
			customButton.setAttribute('aria-pressed', 'true');
			customInput.disabled = false;
			customInput.focus();
		});
		widthChoices.appendChild(customButton);

		var customLabel = element('label', {
			className: 'stillframe-capture-panel__custom',
			for: 'stillframe-custom-width'
		});
		customLabel.appendChild(element('span', { text: text('customWidth') }));
		customInput = element('input', {
			id: 'stillframe-custom-width',
			type: 'number',
			min: String(config.minWidth || 320),
			max: String(config.maxWidth || 2560),
			step: '1',
			inputmode: 'numeric',
			value: '1024'
		});
		customInput.disabled = true;
		customLabel.appendChild(customInput);
		widthSet.appendChild(customLabel);

		var scaleSet = element('fieldset');
		scaleSet.appendChild(element('legend', { text: text('scale') }));
		var scaleChoices = element('div', { className: 'stillframe-capture-panel__choices' });
		var scales = Array.isArray(config.scales) && config.scales.length ? config.scales : [
			{ value: 1, label: '1x' },
			{ value: 2, label: '2x' },
			{ value: 3, label: '3x' }
		];
		var defaultScale = parseInt(config.defaultScale, 10);
		if (defaultScale !== 1 && defaultScale !== 2 && defaultScale !== 3) {
			defaultScale = 2;
		}
		scales.forEach(function (choice) {
			var value = parseInt(choice.value, 10);
			if (value !== 1 && value !== 2 && value !== 3) {
				return;
			}
			var button = element('button', {
				type: 'button',
				className: 'stillframe-scale-choice',
				text: String(choice.label || (value + 'x'))
			});
			button.setAttribute('data-scale', String(value));
			button.setAttribute('aria-pressed', value === defaultScale ? 'true' : 'false');
			button.addEventListener('click', function () {
				Array.prototype.forEach.call(scaleChoices.querySelectorAll('.stillframe-scale-choice'), function (item) {
					item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
				});
			});
			scaleChoices.appendChild(button);
		});
		scaleSet.appendChild(scaleChoices);

		var actions = element('div', { className: 'stillframe-capture-panel__actions' });
		captureButton = element('button', {
			type: 'button',
			className: 'stillframe-capture-go',
			text: text('capture')
		});
		captureButton.addEventListener('click', function () {
			startCapture('frame');
		});
		windowButton = element('button', {
			type: 'button',
			className: 'stillframe-capture-go',
			text: text('captureWindow')
		});
		windowButton.hidden = true;
		windowButton.addEventListener('click', function () {
			startCapture('window');
		});
		actions.appendChild(captureButton);
		actions.appendChild(windowButton);

		statusNode = element('p', {
			className: 'stillframe-capture-status',
			role: 'status'
		});

		editorSection = element('div', { className: 'stillframe-capture-panel__editor' });
		editorSection.hidden = true;
		var stage = element('div', { className: 'stillframe-capture-panel__stage' });
		canvasWrap = element('div', { className: 'stillframe-capture-panel__canvas-wrap' });
		stage.appendChild(canvasWrap);
		var tools = element('div', {
			className: 'stillframe-capture-panel__tools',
			role: 'group',
			'aria-label': text('tools')
		});

		function addTool(name, label, pressed) {
			var button = element('button', {
				type: 'button',
				className: 'stillframe-tool',
				text: label
			});
			button.setAttribute('data-tool', name);
			button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
			button.addEventListener('click', function () {
				Array.prototype.forEach.call(tools.querySelectorAll('.stillframe-tool'), function (item) {
					item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
				});
				if (editor) {
					editor.setTool(name);
				}
			});
			tools.appendChild(button);
			return button;
		}

		penButton = addTool('pen', text('pen'), true);
		addTool('circle', text('circle'), false);
		addTool('arrow', text('arrow'), false);
		undoButton = element('button', {
			type: 'button',
			text: text('undo')
		});
		undoButton.disabled = true;
		undoButton.addEventListener('click', function () {
			if (editor) {
				editor.undo();
			}
		});
		clearButton = element('button', {
			type: 'button',
			text: text('clear')
		});
		clearButton.disabled = true;
		clearButton.addEventListener('click', function () {
			if (editor) {
				editor.clear();
			}
		});
		tools.appendChild(undoButton);
		tools.appendChild(clearButton);

		downloadButton = element('button', {
			type: 'button',
			className: 'stillframe-download-button',
			text: text('download')
		});
		downloadButton.disabled = true;
		downloadButton.addEventListener('click', function () {
			if (!editor || !captured) {
				return;
			}
			downloadButton.disabled = true;
			setStatus(text('preparing'));
			editor.flatten().then(function (blob) {
				saveBlob(blob, fileNameFor(captured.url, captured.width, captured.scale));
				if (!panel) {
					return;
				}
				downloadButton.disabled = false;
				setStatus(formatCaptured(captured.width, captured.scale));
			}).catch(function () {
				if (!panel) {
					return;
				}
				downloadButton.disabled = false;
				setStatus(text('downloadFailed'));
			});
		});

		editorSection.appendChild(stage);
		editorSection.appendChild(tools);
		editorSection.appendChild(downloadButton);

		box.appendChild(header);
		box.appendChild(widthSet);
		box.appendChild(scaleSet);
		box.appendChild(actions);
		box.appendChild(statusNode);
		box.appendChild(editorSection);
		root.appendChild(box);

		root.addEventListener('click', function (event) {
			if (event.target === root) {
				api.closePanel();
			}
		});

		return {
			root: root,
			dialog: box
		};
	}

	api.isOpen = function () {
		return !!panel;
	};

	api.closePanel = function () {
		session += 1;
		removeFrame();
		if (editor) {
			editor.destroy();
			editor = null;
		}
		if (objectUrl) {
			URL.revokeObjectURL(objectUrl);
			objectUrl = '';
		}
		captured = null;
		if (keyHandler) {
			document.removeEventListener('keydown', keyHandler, true);
			keyHandler = null;
		}
		if (focusHandler) {
			document.removeEventListener('focusin', focusHandler, true);
			focusHandler = null;
		}
		if (panel && panel.parentNode) {
			panel.parentNode.removeChild(panel);
		}
		panel = null;
		dialog = null;
		statusNode = null;
		customButton = null;
		customInput = null;
		captureButton = null;
		windowButton = null;
		downloadButton = null;
		undoButton = null;
		clearButton = null;
		penButton = null;
		editorSection = null;
		canvasWrap = null;
		focusMenu();
	};

	api.openPanel = function (focusReturn) {
		if (panel) {
			dialog.focus();
			return;
		}
		returnFocus = focusReturn || null;
		try {
			var built = buildPanel();
			panel = built.root;
			dialog = built.dialog;
			keyHandler = onKeydown;
			focusHandler = onFocusIn;
			document.addEventListener('keydown', keyHandler, true);
			document.addEventListener('focusin', focusHandler, true);
			document.body.appendChild(panel);
			dialog.focus();
		} catch (error) {
			if (panel && panel.parentNode) {
				panel.parentNode.removeChild(panel);
			}
			panel = null;
			dialog = null;
			removeFrame();
			window.alert(text('captureFailed') || 'The capture failed. The page was not changed.');
			focusMenu();
		}
	};
})();
