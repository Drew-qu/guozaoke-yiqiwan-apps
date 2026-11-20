(async function () {
  'use strict';

  var SAVE_KEY = 'fangdai.plans.v1';

  // --- SDK 兼容层（无平台脚本时降级 localStorage） ---
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
    inCommAmt: document.getElementById('inCommAmt'),
    inCommRate: document.getElementById('inCommRate'),
    inFundAmt: document.getElementById('inFundAmt'),
    inFundRate: document.getElementById('inFundRate'),
    inYears: document.getElementById('inYears'),
    yearsLabel: document.getElementById('yearsLabel'),
    blockCommercial: document.getElementById('blockCommercial'),
    blockFund: document.getElementById('blockFund'),
    chkPrepay: document.getElementById('chkPrepay'),
    prepayFields: document.getElementById('prepayFields'),
    inPaidMonths: document.getElementById('inPaidMonths'),
    paidYearsHint: document.getElementById('paidYearsHint'),
    inPrepayAmt: document.getElementById('inPrepayAmt'),
    comboTargetRow: document.getElementById('comboTargetRow'),
    planList: document.getElementById('planList'),
    btnClearPlans: document.getElementById('btnClearPlans'),
    app: document.getElementById('app'),
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
    dockLabel: document.getElementById('dockLabel'),
    dockMonthly: document.getElementById('dockMonthly'),
    kpiMonthlyLabel: document.getElementById('kpiMonthlyLabel'),
    kpiMonthly: document.getElementById('kpiMonthly'),
    kpiMonthlySub: document.getElementById('kpiMonthlySub'),
    kpiPrincipal: document.getElementById('kpiPrincipal'),
    kpiMethodNote: document.getElementById('kpiMethodNote'),
    kpiInterest: document.getElementById('kpiInterest'),
    kpiInterestRatio: document.getElementById('kpiInterestRatio'),
    kpiTotal: document.getElementById('kpiTotal'),
    kpiAltCompare: document.getElementById('kpiAltCompare'),
    prepayCompareSection: document.getElementById('prepayCompareSection'),
    prepayStatusBadge: document.getElementById('prepayStatusBadge'),
    schemeShorten: document.getElementById('schemeShorten'),
    schemeReduce: document.getElementById('schemeReduce'),
    saveInterestA: document.getElementById('saveInterestA'),
    newMonthlyA: document.getElementById('newMonthlyA'),
    savedTimeA: document.getElementById('savedTimeA'),
    newRemainA: document.getElementById('newRemainA'),
    newTotalIntA: document.getElementById('newTotalIntA'),
    saveInterestB: document.getElementById('saveInterestB'),
    newMonthlyB: document.getElementById('newMonthlyB'),
    monthlyDropB: document.getElementById('monthlyDropB'),
    newRemainB: document.getElementById('newRemainB'),
    newTotalIntB: document.getElementById('newTotalIntB'),
    prepayTip: document.getElementById('prepayTip'),
    donutLabel: document.getElementById('donutLabel'),
    chartDonut: document.getElementById('chartDonut'),
    chartTrend: document.getElementById('chartTrend'),
    btnViewYear: document.getElementById('btnViewYear'),
    btnViewMonth: document.getElementById('btnViewMonth'),
    thPeriod: document.getElementById('thPeriod'),
    scheduleBody: document.getElementById('scheduleBody'),
    toast: document.getElementById('toast')
  };

  function setPanel(name) {
    if (!els.app) return;
    els.app.dataset.panel = name;
    if (els.tabParams) els.tabParams.setAttribute('aria-selected', name === 'params' ? 'true' : 'false');
    if (els.tabResults) els.tabResults.setAttribute('aria-selected', name === 'results' ? 'true' : 'false');
    if (els.dockToggle) els.dockToggle.textContent = name === 'params' ? '去结果' : '改参数';
    if (name === 'results') {
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) { window.scrollTo(0, 0); }
    }
  }

  var params = {
    loanType: 'commercial', // 'commercial' | 'fund' | 'combo'
    method: 'equal_installment', // 'equal_installment' | 'equal_principal'
    commAmt: 100,
    commRate: 3.10,
    fundAmt: 60,
    fundRate: 2.60,
    years: 30,
    prepayOn: true,
    paidMonths: 36,
    prepayAmt: 20,
    prepayTarget: 'commercial', // 'commercial' | 'fund'
    activeView: 'shorten', // 'shorten' | 'reduce'
    tableGranularity: 'year' // 'year' | 'month'
  };

  var savedPlans = [];
  var lastResult = null;
  var toastTimer = 0;

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.add('hidden');
    }, 2000);
  }

  // --- 格式化工具 ---
  function fmtYuan(n) {
    return '¥' + Math.round(n).toLocaleString('zh-CN');
  }

  function fmtWan(n) {
    var w = n / 10000;
    return w.toFixed(2) + ' 万';
  }

  function fmtMonths(m) {
    m = Math.max(0, Math.round(m));
    var y = Math.floor(m / 12);
    var rem = m % 12;
    if (y > 0 && rem > 0) return y + ' 年 ' + rem + ' 个月';
    if (y > 0) return y + ' 年';
    return rem + ' 个月';
  }

  // --- 单笔贷款计算引擎 ---
  function calcSingleLoan(principal, annualRatePct, totalMonths, method, prepayOpt) {
    // prepayOpt: null 或 { atMonth, amount, mode: 'shorten' | 'reduce' }
    var r = (annualRatePct / 100) / 12;
    var rows = [];
    var rem = principal;
    var totalInterest = 0;

    function calcPmt(p, n) {
      if (n <= 0 || p <= 0) return 0;
      if (r === 0) return p / n;
      var pow = Math.pow(1 + r, n);
      return p * r * pow / (pow - 1);
    }

    var pmt = method === 'equal_installment' ? calcPmt(principal, totalMonths) : 0;
    var fixedPrin = method === 'equal_principal' ? (principal / totalMonths) : 0;
    var curTotalMonths = totalMonths;
    var prepayDone = false;
    var newFirstMonthly = 0;
    var newRemainMonths = 0;
    var actualPrepay = 0;

    for (var m = 1; m <= 600 && rem > 0.01; m++) {
      var interest = rem * r;
      var prin = 0;
      if (method === 'equal_installment') {
        prin = pmt - interest;
        if (prin > rem || m === curTotalMonths) {
          prin = rem;
        }
      } else {
        prin = fixedPrin;
        if (prin > rem || m === curTotalMonths) {
          prin = rem;
        }
      }
      rem = Math.max(0, rem - prin);
      totalInterest += interest;

      var extra = 0;
      if (prepayOpt && !prepayDone && m === prepayOpt.atMonth && rem > 0.01) {
        prepayDone = true;
        extra = Math.min(rem, prepayOpt.amount);
        actualPrepay = extra;
        rem = Math.max(0, rem - extra);

        if (rem <= 0.01) {
          rem = 0;
          newRemainMonths = 0;
          newFirstMonthly = 0;
        } else {
          var leftMonths = Math.max(1, curTotalMonths - m);
          if (prepayOpt.mode === 'reduce') {
            // 年限不变，减少月供
            newRemainMonths = leftMonths;
            if (method === 'equal_installment') {
              pmt = calcPmt(rem, leftMonths);
              newFirstMonthly = pmt;
            } else {
              fixedPrin = rem / leftMonths;
              newFirstMonthly = fixedPrin + rem * r;
            }
          } else {
            // 月供不变，缩短年限
            if (method === 'equal_installment') {
              if (r === 0) {
                newRemainMonths = Math.ceil(rem / pmt);
              } else if (pmt <= rem * r) {
                newRemainMonths = leftMonths;
              } else {
                newRemainMonths = Math.ceil(Math.log(pmt / (pmt - rem * r)) / Math.log(1 + r));
              }
              newRemainMonths = Math.max(1, Math.min(leftMonths, newRemainMonths));
              curTotalMonths = m + newRemainMonths;
              pmt = calcPmt(rem, newRemainMonths);
              newFirstMonthly = pmt;
            } else {
              // 等额本金保持原每期本金近似不变来缩短年限
              newRemainMonths = Math.max(1, Math.min(leftMonths, Math.ceil(rem / fixedPrin)));
              curTotalMonths = m + newRemainMonths;
              fixedPrin = rem / newRemainMonths;
              newFirstMonthly = fixedPrin + rem * r;
            }
          }
        }
      }

      rows.push({
        month: m,
        payment: prin + interest + extra,
        principal: prin + extra,
        interest: interest,
        remaining: rem,
        isPrepay: extra > 0,
        extra: extra
      });

      if (rem <= 0.01) break;
    }

    return {
      rows: rows,
      totalMonths: rows.length,
      totalInterest: totalInterest,
      totalPayment: principal + totalInterest,
      firstMonthly: rows.length ? rows[0].payment : 0,
      secondMonthly: rows.length > 1 ? rows[1].payment : 0,
      newFirstMonthly: newFirstMonthly,
      newRemainMonths: newRemainMonths,
      actualPrepay: actualPrepay
    };
  }

  // --- 合并两笔贷款明细（组合贷支持） ---
  function mergeLoans(a, b) {
    if (!b) return a;
    var maxLen = Math.max(a.rows.length, b.rows.length);
    var rows = [];
    for (var i = 0; i < maxLen; i++) {
      var ra = a.rows[i] || { payment: 0, principal: 0, interest: 0, remaining: 0, isPrepay: false, extra: 0 };
      var rb = b.rows[i] || { payment: 0, principal: 0, interest: 0, remaining: 0, isPrepay: false, extra: 0 };
      rows.push({
        month: i + 1,
        payment: ra.payment + rb.payment,
        principal: ra.principal + rb.principal,
        interest: ra.interest + rb.interest,
        remaining: ra.remaining + rb.remaining,
        isPrepay: ra.isPrepay || rb.isPrepay,
        extra: ra.extra + rb.extra
      });
    }
    return {
      rows: rows,
      totalMonths: rows.length,
      totalInterest: a.totalInterest + b.totalInterest,
      totalPayment: a.totalPayment + b.totalPayment,
      firstMonthly: rows.length ? rows[0].payment : 0,
      secondMonthly: rows.length > 1 ? rows[1].payment : 0,
      newFirstMonthly: a.newFirstMonthly + b.newFirstMonthly,
      newRemainMonths: Math.max(a.newRemainMonths, b.newRemainMonths),
      actualPrepay: a.actualPrepay + b.actualPrepay
    };
  }

  function runScenario(method, prepayMode) {
    var months = params.years * 12;
    var commP = params.loanType === 'fund' ? 0 : Math.max(1, params.commAmt) * 10000;
    var fundP = params.loanType === 'commercial' ? 0 : Math.max(1, params.fundAmt) * 10000;
    var prepayYen = Math.max(0, params.prepayAmt) * 10000;
    var atM = Math.max(1, Math.min(months - 1, Math.round(params.paidMonths)));

    var optComm = null;
    var optFund = null;

    if (prepayMode && prepayYen > 0) {
      if (params.loanType === 'commercial') {
        optComm = { atMonth: atM, amount: prepayYen, mode: prepayMode };
      } else if (params.loanType === 'fund') {
        optFund = { atMonth: atM, amount: prepayYen, mode: prepayMode };
      } else {
        // 组合贷：优先冲抵所选部分，溢出部分再冲抵另一部分
        var baseFirst = params.prepayTarget === 'commercial'
          ? calcSingleLoan(commP, params.commRate, months, method, null)
          : calcSingleLoan(fundP, params.fundRate, months, method, null);
        var remAtM = (baseFirst.rows[atM - 1] && baseFirst.rows[atM - 1].remaining) || 0;
        var firstPart = Math.min(prepayYen, remAtM);
        var secondPart = Math.max(0, prepayYen - firstPart);

        if (params.prepayTarget === 'commercial') {
          optComm = { atMonth: atM, amount: firstPart, mode: prepayMode };
          if (secondPart > 1) optFund = { atMonth: atM, amount: secondPart, mode: prepayMode };
        } else {
          optFund = { atMonth: atM, amount: firstPart, mode: prepayMode };
          if (secondPart > 1) optComm = { atMonth: atM, amount: secondPart, mode: prepayMode };
        }
      }
    }

    var resC = commP > 0 ? calcSingleLoan(commP, params.commRate, months, method, optComm) : null;
    var resF = fundP > 0 ? calcSingleLoan(fundP, params.fundRate, months, method, optFund) : null;

    // 计算合并后在提前还贷次月的真实月供
    var merged = resC && resF ? mergeLoans(resC, resF) : (resC || resF);
    if (prepayMode) {
      var nextRow = merged.rows[atM]; // 第 atM+1 期
      merged.postMonthly = nextRow ? nextRow.payment : 0;
      merged.postRemainMonths = Math.max(0, merged.totalMonths - atM);
    }
    return merged;
  }

  function calculateAll() {
    var totalPrincipal = (params.loanType === 'fund' ? 0 : params.commAmt) +
      (params.loanType === 'commercial' ? 0 : params.fundAmt);
    totalPrincipal *= 10000;

    var base = runScenario(params.method, null);
    var altMethod = params.method === 'equal_installment' ? 'equal_principal' : 'equal_installment';
    var altBase = runScenario(altMethod, null);

    var shorten = null;
    var reduce = null;
    if (params.prepayOn && params.prepayAmt > 0) {
      shorten = runScenario(params.method, 'shorten');
      reduce = runScenario(params.method, 'reduce');
    }

    lastResult = {
      principal: totalPrincipal,
      base: base,
      altBase: altBase,
      altMethod: altMethod,
      shorten: shorten,
      reduce: reduce
    };

    renderAll();
  }

  function renderAll() {
    var r = lastResult;
    if (!r) return;
    var base = r.base;

    // 1. KPI 卡片
    els.kpiMonthlyLabel.textContent = params.method === 'equal_installment' ? '每月月供' : '首月月供';
    els.kpiMonthly.textContent = fmtYuan(base.firstMonthly);
    if (els.dockLabel) els.dockLabel.textContent = params.method === 'equal_installment' ? '月供' : '首月';
    if (els.dockMonthly) els.dockMonthly.textContent = fmtYuan(base.firstMonthly);
    if (params.method === 'equal_principal' && base.rows.length > 1) {
      var diff = base.firstMonthly - base.secondMonthly;
      els.kpiMonthlySub.textContent = '每月递减约 ' + fmtYuan(diff);
    } else {
      els.kpiMonthlySub.textContent = '共 ' + base.totalMonths + ' 期（' + params.years + ' 年）';
    }

    els.kpiPrincipal.textContent = fmtWan(r.principal);
    els.kpiMethodNote.textContent = params.method === 'equal_installment' ? '等额本息 · 每月固定' : '等额本金 · 逐月递减';
    els.kpiInterest.textContent = fmtWan(base.totalInterest);
    var ratio = base.totalPayment > 0 ? (base.totalInterest / base.totalPayment * 100).toFixed(1) : '0.0';
    els.kpiInterestRatio.textContent = '占总还款 ' + ratio + '%';
    els.kpiTotal.textContent = fmtWan(base.totalPayment);

    var altDiff = base.totalInterest - r.altBase.totalInterest;
    var altName = r.altMethod === 'equal_principal' ? '等额本金' : '等额本息';
    if (altDiff > 500) {
      els.kpiAltCompare.textContent = '换' + altName + '可省 ' + fmtWan(altDiff);
    } else if (altDiff < -500) {
      els.kpiAltCompare.textContent = '比' + altName + '少付 ' + fmtWan(-altDiff);
    } else {
      els.kpiAltCompare.textContent = '与' + altName + '利息接近';
    }

    // 2. 提前还贷对比
    var canCompare = params.prepayOn && params.prepayAmt > 0 && r.shorten && r.reduce;
    els.prepayCompareSection.classList.toggle('hidden', !canCompare);
    if (canCompare) {
      var saveA = Math.max(0, base.totalInterest - r.shorten.totalInterest);
      var saveB = Math.max(0, base.totalInterest - r.reduce.totalInterest);
      var savedM = Math.max(0, base.totalMonths - r.shorten.totalMonths);
      var oldAtNext = (base.rows[params.paidMonths] && base.rows[params.paidMonths].payment) || base.firstMonthly;
      var dropB = Math.max(0, oldAtNext - r.reduce.postMonthly);
      var requestedYen = params.prepayAmt * 10000;
      var actualYen = Math.max(r.shorten.actualPrepay || 0, r.reduce.actualPrepay || 0);
      // 原计划该期正常还款后的剩余本金 = 结清所需上限
      var remAfterRegular = base.rows[params.paidMonths - 1]
        ? base.rows[params.paidMonths - 1].remaining
        : 0;

      els.prepayStatusBadge.textContent = '第 ' + params.paidMonths + ' 期还 ' + params.prepayAmt + ' 万';
      els.saveInterestA.textContent = '省息 ' + fmtYuan(saveA);
      els.newMonthlyA.textContent = r.shorten.postRemainMonths > 0 ? fmtYuan(r.shorten.postMonthly) : '已全部结清';
      els.savedTimeA.textContent = savedM > 0 ? fmtMonths(savedM) : '—';
      els.newRemainA.textContent = r.shorten.postRemainMonths > 0 ? (r.shorten.postRemainMonths + ' 期') : '0 期';
      els.newTotalIntA.textContent = fmtWan(r.shorten.totalInterest);

      els.saveInterestB.textContent = '省息 ' + fmtYuan(saveB);
      els.newMonthlyB.textContent = r.reduce.postRemainMonths > 0 ? fmtYuan(r.reduce.postMonthly) : '已全部结清';
      els.monthlyDropB.textContent = dropB > 0 ? ('-' + fmtYuan(dropB) + '/月') : '已全部结清';
      els.newRemainB.textContent = r.reduce.postRemainMonths > 0 ? (r.reduce.postRemainMonths + ' 期') : '0 期';
      els.newTotalIntB.textContent = fmtWan(r.reduce.totalInterest);

      // 动态胜出徽章：谁更省息谁拿「更省息」
      var badgeA = document.getElementById('badgeRecA');
      var badgeB = document.getElementById('badgeRecB');
      if (badgeA && badgeB) {
        if (saveA > saveB + 100) {
          badgeA.textContent = '更省息';
          badgeA.className = 'tag';
          badgeB.textContent = '减压稳';
          badgeB.className = 'tag tag-alt';
        } else if (saveB > saveA + 100) {
          badgeB.textContent = '更省息';
          badgeB.className = 'tag';
          badgeA.textContent = '减压稳';
          badgeA.className = 'tag tag-alt';
        } else {
          badgeA.textContent = '省息接近';
          badgeA.className = 'tag';
          badgeB.textContent = '减压稳';
          badgeB.className = 'tag tag-alt';
        }
      }

      var tipParts = [];
      if (actualYen > 0 && requestedYen - actualYen > 100) {
        tipParts.push('本次输入 ' + fmtWan(requestedYen) + '，当期剩余本金约 ' + fmtWan(remAfterRegular || actualYen) + '，实际只需还约 ' + fmtWan(actualYen) + ' 即可结清。');
      }
      var gap = saveA - saveB;
      if (r.shorten.postRemainMonths === 0) {
        tipParts.push('🎉 提前还款已足以一次性结清全部剩余本金，实际支付约 ' + fmtWan(actualYen) + '。');
      } else if (gap > 100) {
        tipParts.push('💡 「缩短年限」比「减少月供」多省利息 ' + fmtYuan(gap) + '；现金流宽裕选方案 A，想减压选方案 B。');
      } else if (gap < -100) {
        tipParts.push('💡 「减少月供」在本测算下省息略多 ' + fmtYuan(-gap) + '；仍可按月供压力偏好选择。');
      } else {
        tipParts.push('💡 两种方案省息接近，可按家庭每月现金流偏好选择。');
      }
      if (params.method === 'equal_principal') {
        tipParts.push('等额本金缩期按重算每期本金近似，银行若「保持原本金份额」结清节奏可能略有差异。');
      }
      els.prepayTip.textContent = tipParts.join(' ');

      els.schemeShorten.classList.toggle('selected-view', params.activeView === 'shorten');
      els.schemeReduce.classList.toggle('selected-view', params.activeView === 'reduce');
      document.querySelectorAll('.mini-sel').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.view === params.activeView);
      });
    }

    // 3. 确定当前展示的明细与图表数据源
    var activeData = base;
    var viewLabel = '原计划视图';
    if (params.prepayOn && r.shorten && r.reduce) {
      activeData = params.activeView === 'shorten' ? r.shorten : r.reduce;
      viewLabel = params.activeView === 'shorten' ? '方案 A：缩短年限' : '方案 B：减少月供';
    }
    els.donutLabel.textContent = viewLabel;

    drawDonutChart(r.principal, activeData.totalInterest, base.totalInterest);
    drawTrendChart(activeData.rows, r.principal);
    renderTable(activeData.rows);
  }

  // --- 图表 1：本息占比环形图 ---
  function setupCanvas(cv) {
    var box = cv.parentElement;
    var w = Math.max(200, Math.floor(box.clientWidth));
    var h = Math.max(180, Math.floor(box.clientHeight));
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c: c, w: w, h: h };
  }

  function themeColor(varName, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
  }

  function drawDonutChart(principal, interest, baseInterest) {
    var g = setupCanvas(els.chartDonut);
    var c = g.c, w = g.w, h = g.h;
    c.clearRect(0, 0, w, h);

    var accent = themeColor('--accent', '#1f4b3a');
    var warm = themeColor('--warm', '#a5281b');
    var ink = themeColor('--ink', '#1a2330');
    var muted = themeColor('--muted', '#5f6a78');

    var total = principal + interest;
    var pRatio = total > 0 ? principal / total : 1;
    var saved = Math.max(0, baseInterest - interest);

    var cx = w * 0.36;
    var cy = h * 0.52;
    var radius = Math.min(cx - 16, cy - 16, 74);
    var thick = Math.max(14, radius * 0.28);

    // 本金弧
    var startA = -Math.PI / 2;
    var midA = startA + Math.PI * 2 * pRatio;
    c.lineWidth = thick;
    c.lineCap = 'butt';

    c.beginPath();
    c.arc(cx, cy, radius, startA, midA);
    c.strokeStyle = accent;
    c.stroke();

    // 利息弧
    c.beginPath();
    c.arc(cx, cy, radius, midA, startA + Math.PI * 2);
    c.strokeStyle = warm;
    c.stroke();

    // 中心文字
    c.fillStyle = muted;
    c.font = '600 11px "Avenir Next", "PingFang SC", sans-serif';
    c.textAlign = 'center';
    c.fillText('总还款', cx, cy - 8);
    c.fillStyle = ink;
    c.font = '700 14px "Avenir Next", "PingFang SC", sans-serif';
    c.fillText(fmtWan(total), cx, cy + 12);

    // 右侧图例
    var lx = cx + radius + 24;
    var ly = cy - 40;
    c.textAlign = 'left';

    function legendRow(color, title, val, y) {
      c.fillStyle = color;
      c.beginPath();
      c.arc(lx, y, 5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = muted;
      c.font = '600 11px "Avenir Next", "PingFang SC", sans-serif';
      c.fillText(title, lx + 12, y + 4);
      c.fillStyle = ink;
      c.font = '700 13px "Avenir Next", "PingFang SC", sans-serif';
      c.fillText(val, lx + 12, y + 21);
    }

    legendRow(accent, '本金 (' + (pRatio * 100).toFixed(1) + '%)', fmtWan(principal), ly);
    legendRow(warm, '利息 (' + ((1 - pRatio) * 100).toFixed(1) + '%)', fmtWan(interest), ly + 42);
    if (saved > 100) {
      legendRow(themeColor('--blue', '#2a4f73'), '已省利息', fmtWan(saved), ly + 84);
    }
  }

  // --- 图表 2：逐年本息柱状图 + 剩余本金折线 ---
  function drawTrendChart(rows, totalPrincipal) {
    var g = setupCanvas(els.chartTrend);
    var c = g.c, w = g.w, h = g.h;
    c.clearRect(0, 0, w, h);

    if (!rows.length) return;

    var accent = themeColor('--accent', '#1f4b3a');
    var warm = themeColor('--warm', '#a5281b');
    var blue = themeColor('--blue', '#2a4f73');
    var muted = themeColor('--muted', '#5f6a78');
    var lineCol = themeColor('--line', '#cbbfae');

    // 按年聚合
    var years = [];
    for (var i = 0; i < rows.length; i++) {
      var yIdx = Math.floor(i / 12);
      if (!years[yIdx]) years[yIdx] = { year: yIdx + 1, prin: 0, int: 0, rem: 0, hasPrepay: false };
      years[yIdx].prin += rows[i].principal;
      years[yIdx].int += rows[i].interest;
      years[yIdx].rem = rows[i].remaining;
      if (rows[i].isPrepay) years[yIdx].hasPrepay = true;
    }

    var padL = 44, padR = 14, padT = 18, padB = 26;
    var plotW = w - padL - padR;
    var plotH = h - padT - padB;

    var maxBar = 0;
    years.forEach(function (y) {
      // 忽略提前还贷那年的一次性大额脉冲以免压扁其他年份柱子，截断到正常年份的 1.8 倍
      var normalSum = y.prin + y.int;
      if (!y.hasPrepay && normalSum > maxBar) maxBar = normalSum;
    });
    if (maxBar <= 0) maxBar = years[0].prin + years[0].int;
    maxBar *= 1.18;

    // 横向辅助线
    c.strokeStyle = lineCol;
    c.lineWidth = 1;
    c.fillStyle = muted;
    c.font = '10px "Avenir Next", sans-serif';
    c.textAlign = 'right';
    for (var k = 0; k <= 3; k++) {
      var gy = padT + (plotH * k) / 3;
      c.beginPath();
      c.moveTo(padL, gy);
      c.lineTo(w - padR, gy);
      c.stroke();
      var lblVal = maxBar * (1 - k / 3) / 10000;
      c.fillText(lblVal.toFixed(1) + '万', padL - 6, gy + 3);
    }

    var n = years.length;
    var stepX = plotW / Math.max(1, n);
    var barW = Math.max(3, Math.min(18, stepX * 0.62));

    // 画本金+利息堆叠柱
    years.forEach(function (y, idx) {
      var x = padL + idx * stepX + (stepX - barW) / 2;
      var totalY = Math.min(y.prin + y.int, maxBar);
      var intH = (Math.min(y.int, maxBar) / maxBar) * plotH;
      var prinH = Math.max(0, (totalY / maxBar) * plotH - intH);

      c.fillStyle = accent;
      c.fillRect(x, padT + plotH - prinH, barW, prinH);

      c.fillStyle = warm;
      c.fillRect(x, padT + plotH - prinH - intH, barW, intH);

      // X 轴年份刻度
      var stepLbl = n > 20 ? 5 : (n > 10 ? 3 : 1);
      if (y.year === 1 || y.year === n || y.year % stepLbl === 0) {
        c.fillStyle = muted;
        c.textAlign = 'center';
        c.fillText(y.year + '年', x + barW / 2, h - 8);
      }
    });

    // 画剩余本金曲线
    c.beginPath();
    years.forEach(function (y, idx) {
      var cx = padL + idx * stepX + stepX / 2;
      var cy = padT + plotH * (1 - Math.max(0, y.rem) / Math.max(1, totalPrincipal));
      if (idx === 0) c.moveTo(cx, cy);
      else c.lineTo(cx, cy);
    });
    c.strokeStyle = blue;
    c.lineWidth = 2.2;
    c.stroke();
  }

  // --- 明细表 ---
  function renderTable(rows) {
    els.scheduleBody.innerHTML = '';
    var frag = document.createDocumentFragment();

    if (params.tableGranularity === 'year') {
      els.thPeriod.textContent = '年份';
      var years = [];
      for (var i = 0; i < rows.length; i++) {
        var yIdx = Math.floor(i / 12);
        if (!years[yIdx]) years[yIdx] = { year: yIdx + 1, pay: 0, prin: 0, int: 0, rem: 0, prepay: false };
        years[yIdx].pay += rows[i].payment;
        years[yIdx].prin += rows[i].principal;
        years[yIdx].int += rows[i].interest;
        years[yIdx].rem = rows[i].remaining;
        if (rows[i].isPrepay) years[yIdx].prepay = true;
      }
      years.forEach(function (y) {
        var tr = document.createElement('tr');
        if (y.prepay) tr.className = 'prepay-row';
        tr.innerHTML =
          '<td>第 ' + y.year + ' 年' + (y.prepay ? ' ⚡' : '') + '</td>' +
          '<td>' + fmtYuan(y.pay) + '</td>' +
          '<td>' + fmtYuan(y.prin) + '</td>' +
          '<td>' + fmtYuan(y.int) + '</td>' +
          '<td>' + fmtYuan(y.rem) + '</td>';
        frag.appendChild(tr);
      });
    } else {
      els.thPeriod.textContent = '期数';
      rows.forEach(function (r) {
        var tr = document.createElement('tr');
        if (r.isPrepay) tr.className = 'prepay-row';
        tr.innerHTML =
          '<td>第 ' + r.month + ' 期' + (r.isPrepay ? ' ⚡提前还' : '') + '</td>' +
          '<td>' + fmtYuan(r.payment) + '</td>' +
          '<td>' + fmtYuan(r.principal) + '</td>' +
          '<td>' + fmtYuan(r.interest) + '</td>' +
          '<td>' + fmtYuan(r.remaining) + '</td>';
        frag.appendChild(tr);
      });
    }

    els.scheduleBody.appendChild(frag);
  }

  // --- UI 同步与事件 ---
  function syncInputsFromParams() {
    els.inCommAmt.value = params.commAmt;
    els.inCommRate.value = params.commRate;
    els.inFundAmt.value = params.fundAmt;
    els.inFundRate.value = params.fundRate;
    els.inYears.value = params.years;
    els.yearsLabel.textContent = params.years + ' 年（' + (params.years * 12) + ' 期）';
    els.inPaidMonths.max = String(params.years * 12 - 1);
    if (params.paidMonths >= params.years * 12) params.paidMonths = params.years * 12 - 1;
    els.inPaidMonths.value = params.paidMonths;
    els.paidYearsHint.textContent = '第 ' + Math.ceil(params.paidMonths / 12) + ' 年';
    els.inPrepayAmt.value = params.prepayAmt;
    els.chkPrepay.checked = params.prepayOn;
    els.prepayFields.classList.toggle('hidden', !params.prepayOn);

    els.blockCommercial.classList.toggle('hidden', params.loanType === 'fund');
    els.blockFund.classList.toggle('hidden', params.loanType === 'commercial');
    els.comboTargetRow.classList.toggle('hidden', params.loanType !== 'combo');

    document.querySelectorAll('[data-loan]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.loan === params.loanType);
    });
    document.querySelectorAll('[data-method]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.method === params.method);
    });
    document.querySelectorAll('[data-pretarget]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.pretarget === params.prepayTarget);
    });
    els.btnViewYear.classList.toggle('active', params.tableGranularity === 'year');
    els.btnViewMonth.classList.toggle('active', params.tableGranularity === 'month');
  }

  function bindEvents() {
    function onCopy() {
      if (!lastResult) return;
      var r = lastResult;
      var typeName = params.loanType === 'commercial' ? '商业贷款' : (params.loanType === 'fund' ? '公积金贷款' : '组合贷款');
      var mName = params.method === 'equal_installment' ? '等额本息' : '等额本金';
      var lines = [
        '【房贷精算测算摘要】',
        '方案：' + typeName + ' · ' + mName + ' · ' + fmtWan(r.principal) + ' / ' + params.years + '年',
        '原计划月供：' + fmtYuan(r.base.firstMonthly) + '，总利息：' + fmtWan(r.base.totalInterest)
      ];
      if (params.prepayOn && r.shorten && r.reduce) {
        var saveA = Math.max(0, r.base.totalInterest - r.shorten.totalInterest);
        var saveB = Math.max(0, r.base.totalInterest - r.reduce.totalInterest);
        lines.push('提前还：第 ' + params.paidMonths + ' 期还 ' + params.prepayAmt + ' 万');
        lines.push('  · 方案A（缩短年限）：省息 ' + fmtYuan(saveA) + '，缩短 ' + fmtMonths(r.base.totalMonths - r.shorten.totalMonths));
        lines.push('  · 方案B（减少月供）：省息 ' + fmtYuan(saveB) + '，新月供 ' + fmtYuan(r.reduce.postMonthly));
      }
      var text = lines.join('\n');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          showToast('已复制测算摘要');
        }).catch(function () { fallbackCopy(text); });
      } else {
        fallbackCopy(text);
      }
    }

    function onSavePlan() {
      if (!lastResult) return;
      var typeName = params.loanType === 'commercial' ? '商贷' : (params.loanType === 'fund' ? '公积金' : '组合贷');
      var totalW = (params.loanType === 'fund' ? 0 : params.commAmt) + (params.loanType === 'commercial' ? 0 : params.fundAmt);
      var title = typeName + ' ' + totalW + '万 · ' + params.years + '年' + (params.prepayOn ? (' · 提前还' + params.prepayAmt + '万') : '');
      savedPlans.unshift({
        id: 'p_' + Date.now(),
        title: title,
        meta: (params.method === 'equal_installment' ? '等额本息' : '等额本金') + ' · 月供 ' + fmtYuan(lastResult.base.firstMonthly),
        snapshot: Object.assign({}, params)
      });
      if (savedPlans.length > 8) savedPlans.pop();
      persistPlans();
      renderPlans();
      showToast('已保存到方案列表');
    }

    if (els.tabParams) els.tabParams.addEventListener('click', function () { setPanel('params'); });
    if (els.tabResults) els.tabResults.addEventListener('click', function () { setPanel('results'); });
    if (els.btnGoResults) els.btnGoResults.addEventListener('click', function () { setPanel('results'); });
    if (els.dockToggle) {
      els.dockToggle.addEventListener('click', function () {
        setPanel(els.app.dataset.panel === 'params' ? 'results' : 'params');
      });
    }

    document.querySelectorAll('[data-loan]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        params.loanType = btn.dataset.loan;
        syncInputsFromParams();
        calculateAll();
      });
    });

    document.querySelectorAll('[data-method]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        params.method = btn.dataset.method;
        syncInputsFromParams();
        calculateAll();
      });
    });

    document.querySelectorAll('[data-pretarget]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        params.prepayTarget = btn.dataset.pretarget;
        syncInputsFromParams();
        calculateAll();
      });
    });

    document.querySelectorAll('.chips').forEach(function (box) {
      var targetId = box.dataset.target;
      box.querySelectorAll('button').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var val = Number(btn.dataset.val);
          if (targetId === 'inCommRate') params.commRate = val;
          else if (targetId === 'inFundRate') params.fundRate = val;
          else if (targetId === 'inYears') params.years = val;
          syncInputsFromParams();
          calculateAll();
        });
      });
    });

    function onNumInput() {
      params.commAmt = Math.max(1, Number(els.inCommAmt.value) || 1);
      params.commRate = Math.max(0.1, Number(els.inCommRate.value) || 0.1);
      params.fundAmt = Math.max(1, Number(els.inFundAmt.value) || 1);
      params.fundRate = Math.max(0.1, Number(els.inFundRate.value) || 0.1);
      params.years = Math.max(5, Math.min(30, Number(els.inYears.value) || 30));
      params.paidMonths = Math.max(1, Math.min(params.years * 12 - 1, Number(els.inPaidMonths.value) || 1));
      params.prepayAmt = Math.max(0, Number(els.inPrepayAmt.value) || 0);
      els.yearsLabel.textContent = params.years + ' 年（' + (params.years * 12) + ' 期）';
      els.paidYearsHint.textContent = '第 ' + Math.ceil(params.paidMonths / 12) + ' 年';
      calculateAll();
    }

    [els.inCommAmt, els.inCommRate, els.inFundAmt, els.inFundRate, els.inYears, els.inPaidMonths, els.inPrepayAmt]
      .forEach(function (el) { el.addEventListener('input', onNumInput); });

    els.chkPrepay.addEventListener('change', function () {
      params.prepayOn = els.chkPrepay.checked;
      syncInputsFromParams();
      calculateAll();
    });

    document.querySelectorAll('.mini-sel').forEach(function (btn) {
      btn.addEventListener('click', function () {
        params.activeView = btn.dataset.view;
        renderAll();
      });
    });

    els.btnViewYear.addEventListener('click', function () {
      params.tableGranularity = 'year';
      syncInputsFromParams();
      renderAll();
    });

    els.btnViewMonth.addEventListener('click', function () {
      params.tableGranularity = 'month';
      syncInputsFromParams();
      renderAll();
    });

    if (els.btnCopy) els.btnCopy.addEventListener('click', onCopy);
    if (els.btnCopyDock) els.btnCopyDock.addEventListener('click', onCopy);
    if (els.btnSavePlan) els.btnSavePlan.addEventListener('click', onSavePlan);
    if (els.btnSavePlanMobile) els.btnSavePlanMobile.addEventListener('click', onSavePlan);

    els.btnClearPlans.addEventListener('click', function () {
      savedPlans = [];
      persistPlans();
      renderPlans();
    });

    function onTutorial() {
      sdk.ui.showTutorial().catch(function () {
        showToast('输入贷款参数并开启提前还贷，即可对比两种省息方案');
      });
    }
    if (els.btnTutorial) els.btnTutorial.addEventListener('click', onTutorial);
    if (els.btnTutorialMobile) els.btnTutorialMobile.addEventListener('click', onTutorial);

    window.addEventListener('resize', function () {
      if (lastResult) renderAll();
    });
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

  // --- 方案持久化 ---
  function renderPlans() {
    els.planList.innerHTML = '';
    if (!savedPlans.length) {
      var li = document.createElement('li');
      li.className = 'muted';
      li.textContent = '暂无保存方案，点击右上角「存为方案」可对比多组数据。';
      els.planList.appendChild(li);
      return;
    }
    savedPlans.forEach(function (p) {
      var li = document.createElement('li');
      li.className = 'plan-item';
      li.innerHTML =
        '<div><div class="plan-title">' + escapeHtml(p.title) + '</div>' +
        '<div class="plan-meta">' + escapeHtml(p.meta) + '</div></div>';
      li.addEventListener('click', function () {
        params = Object.assign(params, p.snapshot);
        syncInputsFromParams();
        calculateAll();
        setPanel('results');
        showToast('已加载：' + p.title);
      });
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'plan-del';
      del.textContent = '✕';
      del.addEventListener('click', function (ev) {
        ev.stopPropagation();
        savedPlans = savedPlans.filter(function (x) { return x.id !== p.id; });
        persistPlans();
        renderPlans();
      });
      li.appendChild(del);
      els.planList.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  async function persistPlans() {
    try { await sdk.storage.set(SAVE_KEY, savedPlans); } catch (_) {}
  }

  async function loadPlans() {
    try {
      var saved = await sdk.storage.get(SAVE_KEY);
      if (Array.isArray(saved)) savedPlans = saved;
    } catch (_) {}
  }

  // --- 启动 ---
  try {
    var context = await sdk.ready();
    document.documentElement.dataset.theme = (context && context.theme) || 'light';
    sdk.on('themechange', function (theme) {
      document.documentElement.dataset.theme = theme;
      if (lastResult) renderAll();
    });
    await loadPlans();
    bindEvents();
    syncInputsFromParams();
    renderPlans();
    calculateAll();
  } catch (err) {
    console.error(err);
  }
})();
