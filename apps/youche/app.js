(async function () {
  'use strict';

  var SAVE_KEY = 'youche.plans.v3';

  var POWERTRAINS = {
    ice: { id: 'ice', label: '燃油', short: '油', needsFuel: true, needsElec: false, needsPlugShare: false, needsCharger: false },
    hev: { id: 'hev', label: '油电混动', short: 'HEV', needsFuel: true, needsElec: false, needsPlugShare: false, needsCharger: false },
    phev: { id: 'phev', label: '插混', short: 'PHEV', needsFuel: true, needsElec: true, needsPlugShare: true, needsCharger: true },
    erev: { id: 'erev', label: '增程', short: '增程', needsFuel: true, needsElec: true, needsPlugShare: true, needsCharger: true },
    bev: { id: 'bev', label: '纯电', short: '电', needsFuel: false, needsElec: true, needsPlugShare: false, needsCharger: true }
  };

  var CAR_COLORS = ['#c45c12', '#0b7f8c', '#6b5b95'];

  var hasSdk = !!window.Yiqiwan;
  var sdk = hasSdk ? window.Yiqiwan : {
    ready: function () { return Promise.resolve({ theme: 'light' }); },
    on: function () {},
    storage: {
      get: function (k) {
        try { return Promise.resolve(JSON.parse(localStorage.getItem(k) || 'null')); }
        catch (_) { return Promise.resolve(null); }
      },
      set: function (k, v) {
        try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
        return Promise.resolve();
      }
    },
    ui: {
      showTutorial: function () { return Promise.reject(new Error('offline')); }
    }
  };

  var els = {
    app: document.getElementById('app'),
    inYears: document.getElementById('inYears'),
    yearsLabel: document.getElementById('yearsLabel'),
    inAnnualKm: document.getElementById('inAnnualKm'),
    kmLabel: document.getElementById('kmLabel'),
    inFuelPrice: document.getElementById('inFuelPrice'),
    inHomeRate: document.getElementById('inHomeRate'),
    inPublicRate: document.getElementById('inPublicRate'),
    inHomeShare: document.getElementById('inHomeShare'),
    homeShareLabel: document.getElementById('homeShareLabel'),
    blendRateHint: document.getElementById('blendRateHint'),
    carCards: document.getElementById('carCards'),
    btnAddCar: document.getElementById('btnAddCar'),
    comparePick: document.getElementById('comparePick'),
    inCompareA: document.getElementById('inCompareA'),
    inCompareB: document.getElementById('inCompareB'),
    planList: document.getElementById('planList'),
    btnClearPlans: document.getElementById('btnClearPlans'),
    btnCopy: document.getElementById('btnCopy'),
    btnCopyDock: document.getElementById('btnCopyDock'),
    btnSavePlan: document.getElementById('btnSavePlan'),
    btnSavePlanMobile: document.getElementById('btnSavePlanMobile'),
    btnTutorial: document.getElementById('btnTutorial'),
    btnTutorialMobile: document.getElementById('btnTutorialMobile'),
    btnGoResults: document.getElementById('btnGoResults'),
    tabParams: document.getElementById('tabParams'),
    tabResults: document.getElementById('tabResults'),
    dockToggle: document.getElementById('dockToggle'),
    dockPayback: document.getElementById('dockPayback'),
    verdictKicker: document.getElementById('verdictKicker'),
    verdictTitle: document.getElementById('verdictTitle'),
    verdictSub: document.getElementById('verdictSub'),
    statSaveLabel: document.getElementById('statSaveLabel'),
    statSave: document.getElementById('statSave'),
    statCarALabel: document.getElementById('statCarALabel'),
    statCarA: document.getElementById('statCarA'),
    statCarBLabel: document.getElementById('statCarBLabel'),
    statCarB: document.getElementById('statCarB'),
    chartCurve: document.getElementById('chartCurve'),
    chartLegend: document.getElementById('chartLegend'),
    breakdownBars: document.getElementById('breakdownBars'),
    ledgerHead: document.getElementById('ledgerHead'),
    ledgerBody: document.getElementById('ledgerBody'),
    toast: document.getElementById('toast')
  };

  function defaultCar(kind, name) {
    if (kind === 'ice') {
      return {
        name: name || '车 A',
        type: 'ice',
        price: 14.5,
        fuelCons: 7.5,
        elecCons: 13.5,
        electricShare: 50,
        ins: 4200,
        maint: 1600,
        charger: 0,
        battReserve: 0,
        residual: 4
      };
    }
    if (kind === 'hev') {
      return {
        name: name || '混动车',
        type: 'hev',
        price: 15.8,
        fuelCons: 4.8,
        elecCons: 13.5,
        electricShare: 0,
        ins: 4500,
        maint: 1400,
        charger: 0,
        battReserve: 0,
        residual: 4.5
      };
    }
    if (kind === 'phev' || kind === 'erev') {
      return {
        name: name || (kind === 'erev' ? '增程车' : '插混车'),
        type: kind,
        price: 18.5,
        fuelCons: 6.5,
        elecCons: 15,
        electricShare: 60,
        ins: 5000,
        maint: 1000,
        charger: 3000,
        battReserve: 0,
        residual: 5
      };
    }
    return {
      name: name || '车 B',
      type: 'bev',
      price: 16.8,
      fuelCons: 7.5,
      elecCons: 13.5,
      electricShare: 100,
      ins: 5400,
      maint: 600,
      charger: 3000,
      battReserve: 0,
      residual: 5
    };
  }

  var state = {
    years: 8,
    annualKm: 15000,
    fuelPrice: 7.8,
    homeRate: 0.58,
    publicRate: 1.35,
    homeShare: 70,
    cars: [defaultCar('ice', '燃油车'), defaultCar('bev', '纯电车')],
    compareA: 0,
    compareB: 1
  };

  var savedPlans = [];
  var lastCalc = null;
  var toastTimer = 0;

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.add('hidden'); }, 2200);
  }

  function setPanel(name) {
    if (!els.app) return;
    els.app.dataset.panel = name;
    if (els.tabParams) els.tabParams.setAttribute('aria-selected', name === 'params' ? 'true' : 'false');
    if (els.tabResults) els.tabResults.setAttribute('aria-selected', name === 'results' ? 'true' : 'false');
    if (els.dockToggle) els.dockToggle.textContent = name === 'params' ? '看结论' : '调参';
    if (name === 'results') {
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) { window.scrollTo(0, 0); }
      if (lastCalc) requestAnimationFrame(function () { renderAll(); });
    }
  }

  function fmtYuan(n) {
    var sign = n < 0 ? '-' : '';
    return sign + '¥' + Math.round(Math.abs(n)).toLocaleString('zh-CN');
  }

  function fmtWan(n) {
    return (n / 10000).toFixed(2) + ' 万';
  }

  function formatPaybackLabel(paybackMonth) {
    if (paybackMonth === null) return '未回本';
    if (paybackMonth <= 0.05) return '提车即省';
    var wholeY = Math.floor(paybackMonth / 12);
    var remM = Math.round(paybackMonth % 12);
    if (remM === 12) { wholeY += 1; remM = 0; }
    if (wholeY > 0) return wholeY + ' 年' + (remM > 0 ? (' ' + remM + ' 个月') : '');
    return Math.max(1, Math.round(paybackMonth)) + ' 个月';
  }

  function blendElecRate() {
    return (state.homeShare / 100) * state.homeRate + (1 - state.homeShare / 100) * state.publicRate;
  }

  /**
   * 单车每公里能源成本
   * - 燃油 / HEV：纯油耗（HEV 不外充）
   * - 纯电：电耗 × 综合电价（家充占比只影响电价）
   * - 插混 / 增程：纯电行驶占比拆路程；用电段用电耗×综合电价，用油段用亏电油耗×油价
   */
  function energyPerKm(car) {
    var pt = POWERTRAINS[car.type] || POWERTRAINS.ice;
    var rate = blendElecRate();
    if (car.type === 'ice' || car.type === 'hev') {
      return (Math.max(0.5, car.fuelCons) / 100) * state.fuelPrice;
    }
    if (car.type === 'bev') {
      return (Math.max(4, car.elecCons) / 100) * rate;
    }
    // phev / erev
    var eShare = Math.max(0, Math.min(100, car.electricShare)) / 100;
    var elecPart = eShare * (Math.max(4, car.elecCons) / 100) * rate;
    var fuelPart = (1 - eShare) * (Math.max(0.5, car.fuelCons) / 100) * state.fuelPrice;
    return elecPart + fuelPart;
  }

  function carCapex(car) {
    var pt = POWERTRAINS[car.type] || POWERTRAINS.ice;
    var base = Math.max(0.5, car.price) * 10000;
    if (pt.needsCharger) base += Math.max(0, car.charger || 0);
    return base;
  }

  function carLabel(car, idx) {
    var pt = POWERTRAINS[car.type] || POWERTRAINS.ice;
    var n = (car.name && String(car.name).trim()) || ('车' + String.fromCharCode(65 + idx));
    return n + '（' + pt.short + '）';
  }

  function normalizeCompare() {
    var n = state.cars.length;
    if (state.compareA < 0 || state.compareA >= n) state.compareA = 0;
    if (state.compareB < 0 || state.compareB >= n) state.compareB = Math.min(1, n - 1);
    if (state.compareA === state.compareB) {
      state.compareB = state.compareA === 0 ? Math.min(1, n - 1) : 0;
    }
  }

  function calculate() {
    normalizeCompare();
    var rate = blendElecRate();
    if (els.blendRateHint) {
      els.blendRateHint.textContent =
        '综合电价：¥' + rate.toFixed(2) + ' / 度（家充 ' + state.homeShare + '%）· 只作用于用电里程';
    }

    var years = state.years;
    var annualKm = state.annualKm;
    var totalMonths = years * 12;
    var cars = state.cars;

    var series = cars.map(function (car, idx) {
      var epk = energyPerKm(car);
      var capex = carCapex(car);
      var annualEnergy = annualKm * epk;
      var annualFixed = Math.max(0, car.ins) + Math.max(0, car.maint);
      var residual = Math.max(0, car.residual) * 10000;
      var batt = Math.max(0, car.battReserve || 0);
      return {
        idx: idx,
        car: car,
        label: carLabel(car, idx),
        color: CAR_COLORS[idx % CAR_COLORS.length],
        epk: epk,
        capex: capex,
        annualEnergy: annualEnergy,
        annualFixed: annualFixed,
        residual: residual,
        batt: batt,
        monthlyEnergy: (annualKm / 12) * epk,
        monthlyFixed: annualFixed / 12
      };
    });

    // 回本：所选两车现金累计交叉（不含期末残值）
    var ia = state.compareA;
    var ib = state.compareB;
    var a = series[ia];
    var b = series[ib];
    var cumA = a.capex;
    var cumB = b.capex;
    var paybackMonth = null;
    // diff = A - B：>0 表示 A 累计更贵；回本定义为「较贵起点方被较省方追上」
    // 统一：当「对比里购车更贵的一方」被追上时算回本
    var expensiveIsA = a.capex >= b.capex;
    var prevGap = expensiveIsA ? (cumA - cumB) : (cumB - cumA);
    if (prevGap <= 0) paybackMonth = 0;

    for (var m = 1; m <= totalMonths; m++) {
      cumA += a.monthlyEnergy + a.monthlyFixed;
      cumB += b.monthlyEnergy + b.monthlyFixed;
      if (m === totalMonths) {
        cumA += a.batt;
        cumB += b.batt;
      }
      var gap = expensiveIsA ? (cumA - cumB) : (cumB - cumA);
      if (paybackMonth === null && gap <= 0) {
        if (prevGap > 0 && (prevGap - gap) > 0) {
          paybackMonth = (m - 1) + prevGap / (prevGap - gap);
        } else {
          paybackMonth = m;
        }
      }
      prevGap = gap;
    }

    var yearly = [];
    for (var y = 0; y <= years; y++) {
      var row = { year: y, km: annualKm * y, totals: [], nets: [] };
      series.forEach(function (s) {
        var energy = s.annualEnergy * y;
        var fix = s.annualFixed * y + (y === years ? s.batt : 0);
        var tot = s.capex + energy + fix;
        var net = tot - (y === years ? s.residual : 0);
        row.totals.push(tot);
        row.nets.push(net);
        row['t' + s.idx] = tot;
        row['n' + s.idx] = net;
        row['e' + s.idx] = energy;
        row['f' + s.idx] = fix;
      });
      yearly.push(row);
    }

    var finalRow = yearly[yearly.length - 1];
    var netA = finalRow.nets[ia];
    var netB = finalRow.nets[ib];
    var netDiff = netB - netA; // >0 表示 A 更省（B 净成本更高）

    lastCalc = {
      series: series,
      yearly: yearly,
      finalRow: finalRow,
      paybackMonth: paybackMonth,
      compareA: ia,
      compareB: ib,
      netA: netA,
      netB: netB,
      netDiff: netDiff,
      expensiveIsA: expensiveIsA,
      blendElecRate: rate
    };

    renderAll();
  }

  function renderAll() {
    var c = lastCalc;
    if (!c) return;
    var a = c.series[c.compareA];
    var b = c.series[c.compareB];
    var payLabel = formatPaybackLabel(c.paybackMonth);
    var kmWan = (state.annualKm / 10000).toFixed(1);
    var cheaper = c.netDiff >= 0 ? a : b;
    var dearer = c.netDiff >= 0 ? b : a;
    var absDiff = Math.abs(c.netDiff);

    if (els.verdictKicker) {
      els.verdictKicker.textContent = '持有 ' + state.years + ' 年 · ' + a.label + ' vs ' + b.label;
    }

    var title = '';
    var sub = '按每年 ' + kmWan + ' 万公里测算（期末扣残值）。';
    if (absDiff < 500) {
      title = state.years + ' 年内两车净成本几乎打平。';
    } else {
      title = state.years + ' 年下来，' + cheaper.label + ' 大约少花 ' + fmtWan(absDiff) + '。';
    }

    if (c.paybackMonth !== null && c.paybackMonth <= 0.05) {
      sub = '提车日起「' + (c.expensiveIsA ? b.label : a.label) + '」累计支出就不更高；按每年 ' + kmWan + ' 万公里。';
    } else if (c.paybackMonth !== null) {
      var catcher = c.expensiveIsA ? b.label : a.label;
      var starter = c.expensiveIsA ? a.label : b.label;
      sub = '相对「' + starter + '」，「' + catcher + '」约 ' + payLabel + ' 追上累计支出；之后按年行 ' + kmWan + ' 万 km 继续对比。';
    } else {
      sub = '在 ' + state.years + ' 年内，起点更贵的一方累计支出仍未被追上（现金口径，不含残值冲减）。';
    }

    if (els.verdictTitle) els.verdictTitle.textContent = title;
    if (els.verdictSub) els.verdictSub.textContent = sub;
    if (els.dockPayback) {
      els.dockPayback.textContent = absDiff < 500
        ? '几乎打平'
        : (cheaper.car.name || cheaper.label) + '少花' + fmtWan(absDiff);
    }

    if (els.statSaveLabel) {
      els.statSaveLabel.textContent = state.years + ' 年净差额';
    }
    if (els.statSave) {
      els.statSave.textContent = absDiff < 500 ? '≈0' : ((c.netDiff >= 0 ? a.car.name : b.car.name) + ' 省 ' + fmtWan(absDiff));
      els.statSave.style.color = '';
    }
    if (els.statCarALabel) els.statCarALabel.textContent = a.label + ' 净成本';
    if (els.statCarBLabel) els.statCarBLabel.textContent = b.label + ' 净成本';
    if (els.statCarA) {
      els.statCarA.textContent = fmtWan(c.netA);
      els.statCarA.style.color = a.color;
    }
    if (els.statCarB) {
      els.statCarB.textContent = fmtWan(c.netB);
      els.statCarB.style.color = b.color;
    }

    renderLegend(c.series);
    drawCurveChart(c);
    renderBreakdown(c);
    renderTable(c);
  }

  function renderLegend(series) {
    if (!els.chartLegend) return;
    els.chartLegend.innerHTML = series.map(function (s) {
      return '<i class="swatch" style="background:' + s.color + '"></i>' + escapeHtml(s.car.name || s.label);
    }).join(' ') + ' <i class="swatch s-hit"></i>回本';
  }

  function themeCol(name, fb) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;
  }

  function drawCurveChart(calc) {
    var box = els.chartCurve.parentElement;
    var w = Math.max(240, Math.floor(box.clientWidth));
    var h = Math.max(190, Math.floor(box.clientHeight));
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    els.chartCurve.width = Math.round(w * dpr);
    els.chartCurve.height = Math.round(h * dpr);
    var ctx = els.chartCurve.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var yearly = calc.yearly;
    var series = calc.series;
    if (!yearly.length) return;

    var muted = themeCol('--muted', '#6b7280');
    var ink = themeCol('--ink', '#2a2e33');
    var hitCol = themeCol('--hit', '#3d6f8c');

    var maxVal = 0;
    var minVal = Infinity;
    yearly.forEach(function (r) {
      r.totals.forEach(function (t) {
        maxVal = Math.max(maxVal, t);
        minVal = Math.min(minVal, t);
      });
    });
    minVal = Math.max(0, minVal * 0.92);
    if (maxVal <= minVal) maxVal = minVal + 10000;

    var padL = 44, padR = 10, padT = 12, padB = 26;
    var pw = w - padL - padR;
    var ph = h - padT - padB;
    var maxYear = Math.max(1, yearly[yearly.length - 1].year);

    ctx.strokeStyle = 'rgba(106, 114, 128, 0.14)';
    ctx.lineWidth = 1;
    ctx.fillStyle = muted;
    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.textAlign = 'right';
    for (var g = 0; g <= 2; g++) {
      var gy = padT + (ph * g) / 2;
      ctx.beginPath();
      ctx.moveTo(padL, gy);
      ctx.lineTo(w - padR, gy);
      ctx.stroke();
      var v = maxVal - ((maxVal - minVal) * g) / 2;
      ctx.fillText((v / 10000).toFixed(1) + '万', padL - 6, gy + 3);
    }

    function xOfYear(yrFloat) {
      return padL + (Math.max(0, Math.min(maxYear, yrFloat)) / maxYear) * pw;
    }
    function yOfVal(val) {
      return padT + ph * (1 - (val - minVal) / (maxVal - minVal));
    }

    series.forEach(function (s) {
      ctx.beginPath();
      yearly.forEach(function (r, idx) {
        var x = xOfYear(r.year);
        var y = yOfVal(r.totals[s.idx]);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.8;
      ctx.lineJoin = 'round';
      ctx.stroke();
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = muted;
    yearly.forEach(function (r) {
      if (r.year === 0 || r.year === maxYear || r.year % 2 === 0) {
        ctx.fillText(r.year === 0 ? '购车' : (r.year + '年'), xOfYear(r.year), h - 8);
      }
    });

    if (calc.paybackMonth !== null) {
      var yrAt = calc.paybackMonth / 12;
      var hx = xOfYear(yrAt);
      var yLo = Math.floor(yrAt);
      var yHi = Math.min(maxYear, yLo + 1);
      var rowLo = yearly[yLo] || yearly[0];
      var rowHi = yearly[yHi] || rowLo;
      var t = yHi === yLo ? 0 : (yrAt - yLo) / (yHi - yLo);
      var va = rowLo.totals[calc.compareA] + (rowHi.totals[calc.compareA] - rowLo.totals[calc.compareA]) * t;
      var vb = rowLo.totals[calc.compareB] + (rowHi.totals[calc.compareB] - rowLo.totals[calc.compareB]) * t;
      var hy = yOfVal((va + vb) / 2);

      ctx.save();
      ctx.beginPath();
      ctx.arc(hx, hy, 6, 0, Math.PI * 2);
      ctx.fillStyle = hitCol;
      ctx.fill();
      ctx.fillStyle = ink;
      ctx.font = '600 11px "PingFang SC", sans-serif';
      ctx.textAlign = hx > padL + pw * 0.72 ? 'right' : 'left';
      ctx.fillText('回本', hx + (hx > padL + pw * 0.72 ? -10 : 10), Math.max(padT + 14, hy - 12));
      ctx.restore();
    }
  }

  function renderBreakdown(calc) {
    var series = calc.series;
    var f = calc.finalRow;
    var maxTot = 1;
    series.forEach(function (s) {
      maxTot = Math.max(maxTot, f.totals[s.idx]);
    });

    els.breakdownBars.innerHTML = series.map(function (s) {
      var energy = f['e' + s.idx];
      var fix = f['f' + s.idx];
      var tot = f.totals[s.idx];
      var wCar = (s.capex / maxTot * 100).toFixed(1);
      var wFuel = (energy / maxTot * 100).toFixed(1);
      var wFix = (fix / maxTot * 100).toFixed(1);
      return (
        '<div class="bar-row">' +
          '<div class="bar-head"><span style="color:' + s.color + '">' + escapeHtml(s.label) + '</span>' +
          '<span>支出 ' + fmtWan(tot) + (s.residual > 0 ? (' · 残值 -' + fmtWan(s.residual)) : '') + '</span></div>' +
          '<div class="bar-track">' +
            '<div class="seg-car" style="width:' + wCar + '%;background:' + s.color + '"></div>' +
            '<div class="seg-fuel" style="width:' + wFuel + '%"></div>' +
            '<div class="seg-ins" style="width:' + wFix + '%"></div>' +
          '</div>' +
          '<div class="bar-legs">' +
            '<span>购车起点 ' + fmtWan(s.capex) + '</span>' +
            '<span>能源 ' + fmtWan(energy) + '</span>' +
            '<span>保险保养等 ' + fmtWan(fix) + '</span>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function renderTable(calc) {
    var series = calc.series;
    var head = '<tr><th scope="col">年份</th><th scope="col">累计里程</th>';
    series.forEach(function (s) {
      head += '<th scope="col">' + escapeHtml(s.car.name || s.label) + '</th>';
    });
    head += '<th scope="col">甲−乙</th></tr>';
    els.ledgerHead.innerHTML = head;

    els.ledgerBody.innerHTML = '';
    var hitYear = calc.paybackMonth !== null ? Math.max(0, Math.ceil(calc.paybackMonth / 12)) : -1;
    var frag = document.createDocumentFragment();

    calc.yearly.forEach(function (r) {
      var tr = document.createElement('tr');
      var isHit = r.year === hitYear && calc.paybackMonth !== null;
      if (isHit) tr.className = 'hit-row';
      var diff = r.totals[calc.compareA] - r.totals[calc.compareB];
      var diffCls = diff <= 0 ? 'pos-diff' : 'neg-diff';
      var yearLabel = r.year === 0 ? '购车日' : ('第 ' + r.year + ' 年');
      var cells =
        '<td>' + yearLabel + (isHit ? ' · 回本' : '') + '</td>' +
        '<td>' + (r.km / 10000).toFixed(1) + ' 万 km</td>';
      series.forEach(function (s) {
        cells += '<td>' + fmtWan(r.totals[s.idx]) + '</td>';
      });
      cells += '<td class="' + diffCls + '">' + fmtYuan(diff) + '</td>';
      tr.innerHTML = cells;
      frag.appendChild(tr);
    });
    els.ledgerBody.appendChild(frag);
  }

  function typeOptionsHtml(selected) {
    return Object.keys(POWERTRAINS).map(function (k) {
      var pt = POWERTRAINS[k];
      return '<option value="' + k + '"' + (k === selected ? ' selected' : '') + '>' + pt.label + '</option>';
    }).join('');
  }

  function renderCarCards() {
    var html = '';
    state.cars.forEach(function (car, idx) {
      var pt = POWERTRAINS[car.type] || POWERTRAINS.ice;
      var canRemove = state.cars.length > 2;
      html +=
        '<article class="car-card" data-idx="' + idx + '" style="--car-accent:' + CAR_COLORS[idx % CAR_COLORS.length] + '">' +
          '<div class="car-card-head">' +
            '<label class="field grow" for="carName' + idx + '">' +
              '<span>车辆名称</span>' +
              '<input type="text" id="carName' + idx + '" data-k="name" value="' + escapeAttr(car.name) + '" maxlength="12">' +
            '</label>' +
            (canRemove
              ? '<button type="button" class="text-btn car-remove" data-remove="' + idx + '">移除</button>'
              : '') +
          '</div>' +
          '<label class="field" for="carType' + idx + '">' +
            '<span>动力类型</span>' +
            '<select id="carType' + idx + '" data-k="type">' + typeOptionsHtml(car.type) + '</select>' +
          '</label>' +
          '<label class="field" for="carPrice' + idx + '">' +
            '<span>落地价（万元）</span>' +
            '<input type="number" id="carPrice' + idx + '" data-k="price" inputmode="decimal" min="1" max="500" step="0.5" value="' + car.price + '">' +
          '</label>';

      if (pt.needsFuel && !pt.needsPlugShare) {
        html +=
          '<label class="field" for="carFuel' + idx + '">' +
            '<span>' + (car.type === 'hev' ? '实际油耗' : '油耗') + ' L/100km</span>' +
            '<input type="number" id="carFuel' + idx + '" data-k="fuelCons" inputmode="decimal" min="1" max="30" step="0.1" value="' + car.fuelCons + '">' +
          '</label>';
      }

      if (pt.needsPlugShare) {
        html +=
          '<label class="field" for="carEShare' + idx + '">' +
            '<span>纯电行驶占比 <strong class="eshare-lab">' + car.electricShare + '%</strong></span>' +
            '<input type="range" id="carEShare' + idx + '" data-k="electricShare" min="0" max="100" step="5" value="' + car.electricShare + '">' +
          '</label>' +
          '<p class="hint tight">纯电路程占比 ≠ 家充占比：前者定多少路用电，后者定电价</p>' +
          '<div class="two-col">' +
            '<label class="field" for="carElec' + idx + '">' +
              '<span>纯电电耗 kWh/100km</span>' +
              '<input type="number" id="carElec' + idx + '" data-k="elecCons" inputmode="decimal" min="4" max="40" step="0.5" value="' + car.elecCons + '">' +
            '</label>' +
            '<label class="field" for="carFuel' + idx + '">' +
              '<span>亏电油耗 L/100km</span>' +
              '<input type="number" id="carFuel' + idx + '" data-k="fuelCons" inputmode="decimal" min="1" max="30" step="0.1" value="' + car.fuelCons + '">' +
            '</label>' +
          '</div>';
      }

      if (pt.needsElec && !pt.needsPlugShare) {
        html +=
          '<label class="field" for="carElec' + idx + '">' +
            '<span>电耗 kWh/100km</span>' +
            '<input type="number" id="carElec' + idx + '" data-k="elecCons" inputmode="decimal" min="4" max="40" step="0.5" value="' + car.elecCons + '">' +
          '</label>';
      }

      html +=
        '<details class="car-adv">' +
          '<summary>保险 / 保养' + (pt.needsCharger ? ' / 充电桩' : '') + ' / 残值</summary>' +
          '<div class="two-col">' +
            '<label class="field" for="carIns' + idx + '"><span>年保费</span>' +
              '<input type="number" id="carIns' + idx + '" data-k="ins" inputmode="numeric" min="0" step="100" value="' + car.ins + '"></label>' +
            '<label class="field" for="carMaint' + idx + '"><span>年保养</span>' +
              '<input type="number" id="carMaint' + idx + '" data-k="maint" inputmode="numeric" min="0" step="100" value="' + car.maint + '"></label>' +
          '</div>';
      if (pt.needsCharger) {
        html +=
          '<div class="two-col">' +
            '<label class="field" for="carCharger' + idx + '"><span>充电桩一次投入</span>' +
              '<input type="number" id="carCharger' + idx + '" data-k="charger" inputmode="numeric" min="0" step="500" value="' + (car.charger || 0) + '"></label>' +
            '<label class="field" for="carBatt' + idx + '"><span>期末大件预留</span>' +
              '<input type="number" id="carBatt' + idx + '" data-k="battReserve" inputmode="numeric" min="0" step="1000" value="' + (car.battReserve || 0) + '"></label>' +
          '</div>';
      }
      html +=
          '<label class="field" for="carRes' + idx + '"><span>期末残值（万）</span>' +
            '<input type="number" id="carRes' + idx + '" data-k="residual" inputmode="decimal" min="0" step="0.5" value="' + car.residual + '"></label>' +
        '</details>' +
        '</article>';
    });

    els.carCards.innerHTML = html;
    if (els.btnAddCar) {
      els.btnAddCar.hidden = state.cars.length >= 3;
      els.btnAddCar.disabled = state.cars.length >= 3;
    }
    renderComparePick();
  }

  function renderComparePick() {
    var show = state.cars.length >= 3;
    if (els.comparePick) els.comparePick.hidden = !show;
    if (!show) {
      state.compareA = 0;
      state.compareB = 1;
      return;
    }
    function fill(sel, selected) {
      sel.innerHTML = state.cars.map(function (car, idx) {
        return '<option value="' + idx + '"' + (idx === selected ? ' selected' : '') + '>' +
          escapeHtml(carLabel(car, idx)) + '</option>';
      }).join('');
    }
    fill(els.inCompareA, state.compareA);
    fill(els.inCompareB, state.compareB);
  }

  function escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function escapeHtml(s) {
    return escapeAttr(s);
  }

  function readSharedFromUi() {
    state.years = Math.max(1, Math.min(20, Number(els.inYears.value) || 8));
    state.annualKm = Math.max(1000, Number(els.inAnnualKm.value) || 15000);
    state.fuelPrice = Math.max(1, Number(els.inFuelPrice.value) || 7.8);
    state.homeRate = Math.max(0.05, Number(els.inHomeRate.value) || 0.58);
    state.publicRate = Math.max(0.1, Number(els.inPublicRate.value) || 1.35);
    state.homeShare = Math.max(0, Math.min(100, Number(els.inHomeShare.value) || 0));
    els.yearsLabel.textContent = state.years + ' 年';
    els.kmLabel.textContent = (state.annualKm / 10000).toFixed(1) + ' 万 km / 年';
    els.homeShareLabel.textContent = state.homeShare + '%';
  }

  function syncSharedUi() {
    els.inYears.value = state.years;
    els.yearsLabel.textContent = state.years + ' 年';
    els.inAnnualKm.value = state.annualKm;
    els.kmLabel.textContent = (state.annualKm / 10000).toFixed(1) + ' 万 km / 年';
    els.inFuelPrice.value = state.fuelPrice;
    els.inHomeRate.value = state.homeRate;
    els.inPublicRate.value = state.publicRate;
    els.inHomeShare.value = state.homeShare;
    els.homeShareLabel.textContent = state.homeShare + '%';
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('已复制测算摘要'); }
    catch (_) { showToast('复制失败，请手动截图'); }
    document.body.removeChild(ta);
  }

  function bindEvents() {
    function onCopy() {
      if (!lastCalc) return;
      var c = lastCalc;
      var a = c.series[c.compareA];
      var b = c.series[c.compareB];
      var lines = [
        '【买车养车账本】',
        (els.verdictTitle && els.verdictTitle.textContent) || '',
        (els.verdictSub && els.verdictSub.textContent) || '',
        '对比：' + a.label + ' ' + a.car.price + ' 万 vs ' + b.label + ' ' + b.car.price + ' 万',
        '年行 ' + (state.annualKm / 10000).toFixed(1) + ' 万 km · 持有 ' + state.years + ' 年',
        '净成本：' + a.label + ' ' + fmtWan(c.netA) + ' / ' + b.label + ' ' + fmtWan(c.netB)
      ].filter(Boolean);
      var txt = lines.join('\n');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () {
          showToast('已复制测算摘要');
        }).catch(function () { fallbackCopy(txt); });
      } else {
        fallbackCopy(txt);
      }
    }

    function onSavePlan() {
      if (!lastCalc) return;
      var c = lastCalc;
      savedPlans.unshift({
        id: 'y_' + Date.now(),
        title: state.cars.map(function (car, i) { return carLabel(car, i); }).join(' vs '),
        meta: state.years + '年 · 差额 ' + fmtYuan(c.netDiff),
        snap: {
          years: state.years,
          annualKm: state.annualKm,
          fuelPrice: state.fuelPrice,
          homeRate: state.homeRate,
          publicRate: state.publicRate,
          homeShare: state.homeShare,
          cars: JSON.parse(JSON.stringify(state.cars)),
          compareA: state.compareA,
          compareB: state.compareB
        }
      });
      if (savedPlans.length > 8) savedPlans.pop();
      persistPlans();
      renderPlans();
      showToast('已保存对比方案');
    }

    function onTutorial() {
      sdk.ui.showTutorial().catch(function () {
        showToast('选动力类型、调纯电占比与家充占比，看持有期差多少钱');
      });
    }

    if (els.tabParams) els.tabParams.addEventListener('click', function () { setPanel('params'); });
    if (els.tabResults) els.tabResults.addEventListener('click', function () { setPanel('results'); });
    if (els.btnGoResults) els.btnGoResults.addEventListener('click', function () { setPanel('results'); });
    if (els.dockToggle) {
      els.dockToggle.addEventListener('click', function () {
        setPanel(els.app.dataset.panel === 'params' ? 'results' : 'params');
      });
    }

    if (els.btnTutorialMobile) {
      els.btnTutorialMobile.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      });
    }
    if (els.btnClearPlans) {
      els.btnClearPlans.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      });
    }

    document.querySelectorAll('.chips').forEach(function (box) {
      var target = box.dataset.target;
      box.querySelectorAll('button').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var val = Number(btn.dataset.val);
          if (target === 'inYears') state.years = val;
          else if (target === 'inAnnualKm') state.annualKm = val;
          syncSharedUi();
          calculate();
        });
      });
    });

    [els.inYears, els.inAnnualKm, els.inFuelPrice, els.inHomeRate, els.inPublicRate, els.inHomeShare]
      .forEach(function (el) {
        el.addEventListener('input', function () {
          readSharedFromUi();
          calculate();
        });
      });

    if (els.btnAddCar) {
      els.btnAddCar.addEventListener('click', function () {
        if (state.cars.length >= 3) return;
        state.cars.push(defaultCar('phev', '插混车'));
        state.compareA = 0;
        state.compareB = 1;
        renderCarCards();
        calculate();
        showToast('已加入第三辆，可在下方选择回本比较对象');
      });
    }

    els.carCards.addEventListener('input', function (ev) {
      var t = ev.target;
      var card = t.closest('.car-card');
      if (!card) return;
      var idx = Number(card.dataset.idx);
      var car = state.cars[idx];
      if (!car) return;
      var k = t.dataset.k;
      if (!k) return;

      if (k === 'name') {
        car.name = t.value.slice(0, 12);
      } else if (k === 'type') {
        var next = defaultCar(t.value, car.name);
        next.name = car.name;
        next.price = car.price;
        state.cars[idx] = next;
        renderCarCards();
      } else if (k === 'electricShare') {
        car.electricShare = Math.max(0, Math.min(100, Number(t.value) || 0));
        var lab = card.querySelector('.eshare-lab');
        if (lab) lab.textContent = car.electricShare + '%';
      } else {
        var num = Number(t.value);
        if (!isFinite(num)) return;
        car[k] = num;
      }
      calculate();
    });

    els.carCards.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t && t.dataset.k === 'type') {
        // already handled on input for select in some browsers; ensure once
      }
    });

    els.carCards.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-remove]');
      if (!btn) return;
      var idx = Number(btn.getAttribute('data-remove'));
      if (state.cars.length <= 2) return;
      state.cars.splice(idx, 1);
      state.compareA = 0;
      state.compareB = 1;
      renderCarCards();
      calculate();
    });

    if (els.inCompareA) {
      els.inCompareA.addEventListener('change', function () {
        state.compareA = Number(els.inCompareA.value) || 0;
        normalizeCompare();
        renderComparePick();
        calculate();
      });
    }
    if (els.inCompareB) {
      els.inCompareB.addEventListener('change', function () {
        state.compareB = Number(els.inCompareB.value) || 1;
        normalizeCompare();
        renderComparePick();
        calculate();
      });
    }

    if (els.btnCopy) els.btnCopy.addEventListener('click', onCopy);
    if (els.btnCopyDock) els.btnCopyDock.addEventListener('click', onCopy);
    if (els.btnSavePlan) els.btnSavePlan.addEventListener('click', onSavePlan);
    if (els.btnSavePlanMobile) els.btnSavePlanMobile.addEventListener('click', onSavePlan);
    if (els.btnTutorial) els.btnTutorial.addEventListener('click', onTutorial);
    if (els.btnTutorialMobile) els.btnTutorialMobile.addEventListener('click', onTutorial);

    els.btnClearPlans.addEventListener('click', function () {
      savedPlans = [];
      persistPlans();
      renderPlans();
    });

    window.addEventListener('resize', function () {
      if (lastCalc) renderAll();
    });
  }

  function renderPlans() {
    els.planList.innerHTML = '';
    if (!savedPlans.length) {
      var li = document.createElement('li');
      li.className = 'hint';
      li.textContent = '暂无保存方案，可存多组对比随时切换。';
      els.planList.appendChild(li);
      return;
    }
    savedPlans.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'plan-item';
      li.innerHTML =
        '<div><div class="plan-title">' + escapeHtml(item.title) + '</div>' +
        '<div class="plan-meta">' + escapeHtml(item.meta) + '</div></div>';
      li.addEventListener('click', function () {
        if (!item.snap) return;
        state.years = item.snap.years || 8;
        state.annualKm = item.snap.annualKm || 15000;
        state.fuelPrice = item.snap.fuelPrice || 7.8;
        state.homeRate = item.snap.homeRate || 0.58;
        state.publicRate = item.snap.publicRate || 1.35;
        state.homeShare = item.snap.homeShare != null ? item.snap.homeShare : 70;
        if (Array.isArray(item.snap.cars) && item.snap.cars.length >= 2) {
          state.cars = item.snap.cars.map(function (c) {
            return Object.assign(defaultCar(c.type || 'ice', c.name), c);
          });
        }
        state.compareA = item.snap.compareA != null ? item.snap.compareA : 0;
        state.compareB = item.snap.compareB != null ? item.snap.compareB : 1;
        syncSharedUi();
        renderCarCards();
        calculate();
        setPanel('results');
        showToast('已加载方案');
      });
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'plan-del';
      del.setAttribute('aria-label', '删除方案');
      del.textContent = '✕';
      del.addEventListener('click', function (ev) {
        ev.stopPropagation();
        savedPlans = savedPlans.filter(function (x) { return x.id !== item.id; });
        persistPlans();
        renderPlans();
      });
      li.appendChild(del);
      els.planList.appendChild(li);
    });
  }

  async function persistPlans() {
    try { await sdk.storage.set(SAVE_KEY, savedPlans); } catch (_) {}
  }

  async function loadPlans() {
    try {
      var s = await sdk.storage.get(SAVE_KEY);
      if (Array.isArray(s)) savedPlans = s;
    } catch (_) {}
  }

  try {
    var ctx = await sdk.ready();
    document.documentElement.dataset.theme = (ctx && ctx.theme) || 'light';
    sdk.on('themechange', function (theme) {
      document.documentElement.dataset.theme = theme;
      if (lastCalc) renderAll();
    });
    await loadPlans();
    bindEvents();
    syncSharedUi();
    renderCarCards();
    renderPlans();
    calculate();
  } catch (err) {
    console.error(err);
  }
})();
