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
  assert(/\.quick-nav\.is-collapsed:not\(:hover\):not\(:focus-within\)/.test(html), 'quick navigation should auto-expand on hover/focus and collapse after hover/focus leaves');
  assert(!html.includes('window.addEventListener(\'scroll\',expand'), 'quick navigation should not stay expanded because of scroll-triggered expansion');
  assert(html.includes('jumpToSection(b.dataset.jump); b.blur();'), 'quick navigation should blur clicked buttons so it can auto-collapse after navigation');
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

function testDashboardDrillModalAndGrowthMovementContracts() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert(html.includes('preferBasePrimary:true'), 'growth movement rows should promote metric breakdowns for value-cell drill-downs');
  assert(html.includes('supportLabel:\'Seven-month trend history\''), 'growth movement drill-downs should keep trend history as a separate support section');
  assert(html.includes('const useBasePrimary'), 'cell drill payloads should support base metric breakdowns as primary content');
  assert(html.includes('Metric breakdown'), 'drill-down context should label metric breakdowns clearly');
  assert(html.includes('drill-layout'), 'drill modal should use a structured layout wrapper');
  assert(html.includes('drill-card primary'), 'drill modal should visually distinguish primary drill content');
  assert(html.includes('Clicked-cell context'), 'drill modal should keep clicked-cell analytics visible');
  assert(html.includes('Selected row values'), 'drill modal should show selected row values as a distinct section');
  assert(html.includes('${drillAttr(kpiDrill(key,label))}'), 'summary insight cards should open KPI drill-downs');
}

function testDashboardRetentionWatchlistAndHeaderContracts() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert(html.includes('id="riskWatchlistExplanation"'), 'retention risk watchlist should show a calculation note under the table');
  assert(html.includes('expiring paid memberships multiplied by churn rate'), 'risk watchlist note should explain exposed-lapse ranking');
  assert(html.includes('border-bottom:2px solid color-mix'), 'table headers should have a stronger bottom border');
  assert(html.includes('font-weight:1000!important'), 'table headers should be more bold');
}

function testDashboardCockpitHeaderContracts() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert(html.includes('class="topbar cockpit-header"'), 'header should be the image-backed cockpit surface');
  assert(html.includes('class="cockpit-controls"'), 'month selector and studio tabs should live in the cockpit header');
  assert(html.includes('class="network-strip header-network" id="networkCards"'), 'network cards should be merged into the cockpit header');
  assert(!html.includes('Studio performance with drill-down analytics behind every number.'), 'old hero headline should be removed');
  assert(html.includes('.cockpit-header,'), 'cockpit header should have dedicated styling');
  assert(html.includes('.hero{\n  display:none!important;'), 'old hero section should not render as a separate block');
  assert(html.includes('grid-template-areas:"spacer month" "tabs tabs"'), 'cockpit controls should pin month selector to the top-right above tabs');
  assert(html.includes('grid-template-columns:repeat(4,minmax(0,1fr))!important'), 'location tabs should use equal-width grid columns');
  assert(html.includes('width:100%!important;\n  height:40px!important;'), 'location tab buttons should fill equal-width columns');
  assert(html.includes('backdrop-filter:blur(18px) saturate(145%)'), 'network cards should use a transparent glassmorphic background');
  assert(html.includes('html[data-theme="light"] .cockpit-header .header-network > .network-card.tone-gold'), 'cockpit network cards should override global light-theme tone card backgrounds');
  assert(html.includes('content:none!important;'), 'cockpit network cards should suppress global card pseudo-layers');
  assert(html.includes('grid-template-columns:minmax(0,1fr) minmax(76px,30%)!important'), 'cockpit cards should use a shorter two-column metric/sparkline layout');
  assert(html.includes('min-height:64px!important'), 'cockpit cards should be visually shorter than regular metric cards');
  assert(html.includes('height:24px!important'), 'cockpit sparklines should be compact');
  assert(html.includes('color:#fff!important;'), 'cockpit sparklines should render in white');
  assert(html.includes('.cockpit-header .network-card .spark-dot{\n  display:none!important;'), 'cockpit sparklines should not use dot-style animation');
  assert(html.includes('@keyframes cockpitSparkDraw'), 'network card sparklines should have cockpit-specific draw animation');
  assert(html.includes('const COCKPIT_IMAGES = ['), 'cockpit header should rotate through a curated image pool');
  assert(html.includes('--cockpit-image'), 'cockpit header image should be controlled by a CSS variable');
  assert(html.includes('function setRandomCockpitImage'), 'cockpit header should choose random images at runtime');
  assert(html.includes('window.setInterval(setRandomCockpitImage, 14000)'), 'cockpit header should keep changing images while the app is open');
  assert(html.includes("netCard('Studio sales'"), 'cockpit cards should display selected-studio metrics');
  assert(!html.includes("netCard('Network sales'"), 'cockpit cards should no longer display network-wide metrics');
  assert(html.includes('sparkline(key,tone,network)'), 'cockpit cards should support studio-specific sparkline data');
}

(async () => {
  await testManagementReadoutNormalizesRevenueUnits();
  testDashboardContainsCachedTableInsightRefresh();
  testDashboardTooltipAndCellDrillContracts();
  testDashboardSalesSourceDrillContracts();
  testDashboardQuickNavAutoCollapses();
  testDashboardOpportunityChurnAndTrainerFooterContracts();
  testDashboardDrillModalAndGrowthMovementContracts();
  testDashboardRetentionWatchlistAndHeaderContracts();
  testDashboardCockpitHeaderContracts();
  console.log('Regression tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
