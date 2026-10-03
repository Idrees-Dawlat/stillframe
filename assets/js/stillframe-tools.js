(function () {
	'use strict';

	var pickerMount = document.getElementById('stillframe-target-page');
	var toolsData = window.StillframeToolsData || {};
	var pagePicker = null;
	var startBtn = document.getElementById('stillframe-start-multicapture');

	var DEVICE_META = {
		desktop: { label: 'Desktop', icon: 'desktop', estHeight: 900 },
		ipad: { label: 'iPad', icon: 'tablet', estHeight: 1112 },
		phone: { label: 'Mobile', icon: 'mobile', estHeight: 844 }
	};

	// Device tiles: keep the highlighted state in step with the hidden checkbox.
	Array.prototype.forEach.call(document.querySelectorAll('.stillframe-device-tile'), function (card) {
		var cb = card.querySelector('input[type="checkbox"]');
		if (!cb) {
			return;
		}
		cb.addEventListener('change', function () {
			card.classList.toggle('is-active', cb.checked);
		});
	});

	// Resolution and height pills.
	Array.prototype.forEach.call(document.querySelectorAll('.stillframe-pill-selector'), function (group) {
		var pills = group.querySelectorAll('.stillframe-pill');
		Array.prototype.forEach.call(pills, function (pill) {
			var radio = pill.querySelector('input[type="radio"]');
			if (!radio) {
				return;
			}
			radio.addEventListener('change', function () {
				Array.prototype.forEach.call(pills, function (p) {
					var r = p.querySelector('input[type="radio"]');
					p.classList.toggle('is-active', !!(r && r.checked));
				});
			});
		});
	});

	if (pickerMount && window.StillframeCapture && typeof window.StillframeCapture.createPagePicker === 'function') {
		pagePicker = window.StillframeCapture.createPagePicker({
			pages: toolsData.pages,
			homeUrl: toolsData.homeUrl || ''
		});
		pickerMount.appendChild(pagePicker.root);
	}

	function getTargetUrl() {
		return pagePicker ? pagePicker.getValue() : '';
	}

	function getSelectedDevices() {
		var list = [];
		Array.prototype.forEach.call(document.querySelectorAll('input[name="stillframe_devices[]"]:checked'), function (cb) {
			var meta = DEVICE_META[cb.value] || DEVICE_META.desktop;
			list.push({
				id: cb.value,
				label: meta.label,
				icon: meta.icon,
				estHeight: meta.estHeight,
				width: parseInt(cb.getAttribute('data-width'), 10) || 1440
			});
		});
		return list;
	}

	function checkedValue(name, fallback) {
		var selected = document.querySelector('input[name="' + name + '"]:checked');
		return selected ? selected.value : fallback;
	}

	// The capture opens the same pop-up editor as the top-bar capture,
	// with every chosen device ready to switch between.
	function startCapture() {
		var url = getTargetUrl();
		if (!url) {
			window.alert('Please select a target page or enter a URL to capture.');
			if (pagePicker) {
				pagePicker.focusCustom();
			}
			return;
		}

		var devices = getSelectedDevices();
		if (!devices.length) {
			window.alert('Please select at least one device to capture.');
			return;
		}

		var engine = window.StillframeCapture || {};
		if (typeof engine.openMultiCapture !== 'function') {
			window.alert('Stillframe is still loading. Please try again in a moment.');
			return;
		}

		var hideAdminBarEl = document.getElementById('stillframe-hide-admin-bar');
		engine.openMultiCapture(
			url,
			devices,
			parseInt(checkedValue('stillframe_scale', '2'), 10) || 2,
			hideAdminBarEl ? hideAdminBarEl.checked : true,
			checkedValue('stillframe_height_mode', 'viewport') === 'fullpage'
		);
	}

	if (startBtn) {
		startBtn.addEventListener('click', startCapture);
	}
})();
