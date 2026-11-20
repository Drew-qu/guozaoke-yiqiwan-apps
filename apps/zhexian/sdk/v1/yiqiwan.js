(function (global) {
  'use strict';
  var listeners = {};
  var storeKey = 'yiqiwan-mock-store';

  function loadStore() {
    try { return JSON.parse(localStorage.getItem(storeKey) || '{}') || {}; }
    catch (_) { return {}; }
  }
  function saveStore(obj) {
    localStorage.setItem(storeKey, JSON.stringify(obj));
  }

  var api = {
    ready: function () {
      return Promise.resolve({ theme: 'light', user: null, preview: true });
    },
    on: function (evt, fn) {
      (listeners[evt] || (listeners[evt] = [])).push(fn);
    },
    storage: {
      get: function (key) {
        var s = loadStore();
        return Promise.resolve(s[key]);
      },
      set: function (key, value) {
        var s = loadStore();
        s[key] = value;
        saveStore(s);
        return Promise.resolve();
      }
    },
    scores: {
      me: function () {
        return Promise.resolve({ loggedIn: false, displayName: '预览游客' });
      },
      list: function () {
        return Promise.resolve({ items: [] });
      },
      submit: function () {
        return Promise.reject(new Error('preview mock'));
      }
    },
    ui: {
      showTutorial: function () {
        alert('折线：自由连点不交叉，可有墙/S·E\n描边：沿灰轨走完每条边\n填格：上下左右填满空格');
        return Promise.resolve();
      },
      onViewportChange: function (fn) {
        window.addEventListener('resize', fn);
      }
    }
  };

  global.Yiqiwan = api;
})(window);
