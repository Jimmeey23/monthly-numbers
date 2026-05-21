const assert = require('assert');
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');

function makeReq(payload) {
  const req = new EventEmitter();
  req.method = 'POST';
  process.nextTick(() => {
    req.emit('data', Buffer.from(JSON.stringify(payload)));
    req.emit('end');
  });
  return req;
}

function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(body) {
      this.body = body;
      this.done(JSON.parse(body));
    },
    wait() {
      return new Promise(resolve => {
        this.done = resolve;
      });
    }
  };
}

async function testManagementReadoutNormalizesRevenueUnits() {
  process.env.DEEPSEEK_API_KEY = 'test-key';
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: 'Sales increased 5% month over month to 2.02 million, driven by session revenue growth of 19% to 1.73 million.'
        }
      }]
    })
  });

  delete require.cache[require.resolve('../api/management-readout.js')];
  const handler = require('../api/management-readout.js');
  const res = makeRes();
  const done = res.wait();
  await handler(makeReq({
    studio: 'Kwality House',
    month: 'April 2026',
    current: { sales: 2020000, sessionRevenue: 1730000 },
    previous: { sales: 1920000, sessionRevenue: 1450000 }
  }), res);
  const body = await done;
  const text = body.lines.join(' ');
  assert(!/\bmillion\b/i.test(text), `readout should not contain million: ${text}`);
  assert(text.includes('₹20.2L'), `readout should include formatted sales value: ${text}`);
  assert(text.includes('₹17.3L'), `readout should include formatted session value: ${text}`);
}

function testDashboardContainsCachedTableInsightRefresh() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert(html.includes('/api/table-insight'), 'dashboard should call the table insight API');
  assert(html.includes('function refreshTableInsights'), 'dashboard should define cached table insight refresh');
  assert(html.includes('tableInsightCacheKey'), 'dashboard should cache table insights by table data key');
}

function testDashboardTooltipAndCellDrillContracts() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert(!/(^|\n)\s*\[data-tooltip\][^{]*::?before,[\s\S]{0,180}?display\s*:\s*none\s*!important/i.test(html), 'tooltip pseudo-elements should not be globally disabled');
  assert(html.includes('class="nav-icon"'), 'quick navigation should render icon markup');
  assert(html.includes('id="themeFloat"'), 'theme switcher should be a standalone top-right control');
  assert(!/<nav class="quick-nav"[\s\S]*data-action="theme"[\s\S]*<\/nav>/.test(html), 'theme switcher should not live inside quick navigation');
  assert(html.includes('id="tableTooltip"'), 'table info tooltip should render through a body-level portal');
  assert(html.includes('function showTableTooltip'), 'dashboard should position table tooltips with JavaScript');
  assert(html.includes('function cellDrillPayload'), 'dashboard should create context-aware cell drill payloads');
  assert(html.includes('data-cell-drill'), 'table cells should be marked as cell-level drill targets');
  assert(html.includes('Selected cell'), 'drill drawer should expose clicked-cell context');
}

function testDashboardSalesSourceDrillContracts() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const asset = fs.readFileSync(path.join(__dirname, '..', 'assets', 'sales-drill-index.js'), 'utf8');
  const rawAsset = fs.readFileSync(path.join(__dirname, '..', 'assets', 'raw-drill-index.js'), 'utf8');
  assert(html.includes('assets/sales-drill-index.js'), 'dashboard should load generated raw sales drill index');
  assert(html.includes('assets/raw-drill-index.js'), 'dashboard should load generated non-sales raw drill index');
  assert(asset.includes('window.SALES_DRILL_INDEX'), 'raw sales drill index should be exposed to dashboard code');
  assert(rawAsset.includes('window.RAW_DRILL_INDEX'), 'raw non-sales drill index should be exposed to dashboard code');
  assert(html.includes('function salesDrillRows'), 'dashboard should resolve source transaction rows for sales drill paths');
  assert(html.includes('function rawDrillRows'), 'dashboard should resolve source rows for non-sales drill paths');
  assert(html.includes('sourceRows'), 'drill payload should carry transaction source rows');
  assert(html.includes('Source transactions'), 'drill drawer should render source transaction rows');
  assert(html.includes("source:{kind:'category'"), 'sales category rows should define category source drill paths');
  assert(html.includes("source:{kind:'product'"), 'product rows should define product source drill paths');
  assert(html.includes("source:{kind:'sessionClass'"), 'class rows should define session source drill paths');
  assert(html.includes("source:{kind:'newSource'"), 'new-member source rows should define raw source drill paths');
  assert(html.includes("source:{kind:'leadSource'"), 'lead source rows should define CRM raw source drill paths');
  assert(html.includes("source:{kind:'lapsedMembership'"), 'churn rows should define lapsed membership raw source drill paths');
  assert(asset.includes('Memberships'), 'raw drill index should include membership category transaction paths');
  assert(asset.includes('Payment Value'), 'raw drill index should retain payment value context');
  assert(rawAsset.includes('sessionClass'), 'raw drill index should include session class paths');
  assert(rawAsset.includes('leadSource'), 'raw drill index should include lead source paths');
  assert(rawAsset.includes('lapsedMembership'), 'raw drill index should include lapsed membership paths');
}

function testDashboardQuickNavAutoCollapses() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert(html.includes('class="quick-nav is-collapsed"'), 'quick navigation should render collapsed by default');
  assert(/\.quick-nav\.is-collapsed[\s\S]{0,90}:not\(:hover\):not\(:focus-within\)/.test(html), 'quick navigation should auto-expand on hover/focus');
  assert(html.includes('aria-label="Quick section navigation. Hover or focus to expand."'), 'quick navigation should describe expand behavior accessibly');
}

function testDashboardOpportunityChurnAndTrainerFooterContracts() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert(html.includes('id="businessOpportunityExplanation"'), 'growth opportunity queue should include an explanatory readout');
  assert(html.includes('Why flagged'), 'growth opportunity queue should explain why each row is selected');
  assert(html.includes('Next action'), 'growth opportunity queue should show recommended actions');
  assert(html.includes('Owner'), 'growth opportunity queue should show action ownership');
  assert(html.includes('id="churnRiskExplanation"'), 'churn table should explain churn-risk calculation and action logic');
  assert(html.includes("['Formula','Lapsed / expiring paid memberships']"), 'churn drill-down should expose the churn-risk formula');
  assert(html.includes('function churnAction'), 'dashboard should calculate churn action labels');
  assert(html.includes('function churnRiskBand'), 'dashboard should calculate churn risk bands');
  assert(html.includes('footerCells'), 'table helper should support explicit footer values');
  assert(html.includes('trainerFooter'), 'trainer scoreboard should use an explicit total footer');
  assert(html.includes('one(trainerTotals.pax/Math.max(trainerTotals.cls,1))'), 'trainer total Avg incl should be weighted attendance per class');
  assert(html.includes('one(trainerTotals.pax/Math.max(trainerTotals.active,1))'), 'trainer total Avg excl should be weighted attendance per active class');
}

(async () => {
  await testManagementReadoutNormalizesRevenueUnits();
  testDashboardContainsCachedTableInsightRefresh();
  testDashboardTooltipAndCellDrillContracts();
  testDashboardSalesSourceDrillContracts();
  testDashboardQuickNavAutoCollapses();
  testDashboardOpportunityChurnAndTrainerFooterContracts();
  console.log('Regression tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
