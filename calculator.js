// VMware Avi Load Balancer Sizing Calculator - Complete with Logging
// Tracks every calculation step with detailed explanations

// Global state management
const calculationData = {
  environments: {
    'dc-prod': { year1: {}, year2: {}, year3: {}, waf: false },
    'dc-nonprod': { year1: {}, year2: {}, year3: {}, waf: false },
    'dr-prod': { year1: {}, year2: {}, year3: {}, waf: false },
    'dr-nonprod': { year1: {}, year2: {}, year3: {}, waf: false }
  },
  arch: { segModel: 'shared', haConfig: 'elastic' },
  currentYears: { 'dc-prod': 1, 'dc-nonprod': 1, 'dr-prod': 1, 'dr-nonprod': 1 },
  quickSizing: null,
  advancedResults: null,
  logs: []
};

// Capacity constants
const CAPACITY = {
  L7_SSL_GBPS: 1.0, L4_GBPS: 2.0,
  SSL_TPS_RSA2K: 2000, SSL_TPS_ECC: 4000,
  L7_RPS: 40000, L4_CPS: 100000,
  WAF_MULTIPLIER: 6, GSLB_SE_PER_SITE: 2,
  MAX_VRFS_PER_SE: 9,
  CONTROLLER_SMALL: 200, CONTROLLER_MEDIUM: 1000, CONTROLLER_LARGE: 5000
};

// Logging utility
function addLog(message, type = 'info') {
  calculationData.logs.push({ message, type, timestamp: new Date() });
}

function clearLogs() {
  calculationData.logs = [];
}

// Navigation
function showSection(section) {
  document.querySelectorAll('.nav-link').forEach(item => item.classList.remove('active'));
  const navItem = document.querySelector(`.nav-link[data-section="${section}"]`);
  if (navItem) navItem.classList.add('active');
  
  ['quick', 'advanced', 'results', 'guide', 'logs'].forEach(s => {
    const el = document.getElementById(`${s}-section`);
    if (el) el.classList.toggle('hidden', s !== section);
  });
}

function showTab(tab) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const tabEl = document.querySelector(`.nav-tab[data-tab="${tab}"]`);
  if (tabEl) tabEl.classList.add('active');
  
  ['dc-prod', 'dc-nonprod', 'dr-prod', 'dr-nonprod', 'gslb', 'architecture'].forEach(t => {
    const el = document.getElementById(`${t}-tab`);
    if (el) el.classList.toggle('hidden', t !== tab);
  });
}

function selectYear(env, year) {
  calculationData.currentYears[env] = year;
  const tabContainer = document.querySelector(`#${env}-tab .year-tabs`);
  if (tabContainer) {
    tabContainer.querySelectorAll('.year-tab').forEach((tab, idx) => {
      tab.classList.toggle('active', idx + 1 === year);
    });
  }
  storeCurrentYearData(env);
  loadYearData(env, year);
}

function storeCurrentYearData(env) {
  const currentYear = calculationData.currentYears[env];
  const yearKey = `year${currentYear}`;
  const inputs = document.querySelectorAll(`[data-env="${env}"]`);
  inputs.forEach(input => {
    const field = input.dataset.field;
    if (field) {
      calculationData.environments[env][yearKey][field] = 
        input.tagName === 'SELECT' ? input.value : (parseFloat(input.value) || 0);
    }
  });
}

function loadYearData(env, year) {
  const yearKey = `year${year}`;
  const yearData = calculationData.environments[env][yearKey];
  const inputs = document.querySelectorAll(`[data-env="${env}"]`);
  inputs.forEach(input => {
    const field = input.dataset.field;
    if (field && yearData[field] !== undefined) {
      input.value = yearData[field];
    } else if (input.tagName !== 'SELECT') {
      input.value = '';
    }
  });
}

function toggleOption(element, env, field, value) {
  const group = element?.parentElement;
  if (group) group.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
  element.classList.add('active');
  
  if (env === 'arch') {
    calculationData.arch[field] = value;
  } else {
    calculationData.environments[env][field] = value;
  }
}

// Quick Sizing with Logging
function calculateQuick() {
  clearLogs();
  const vcfCores = parseFloat(document.getElementById('vcf-cores').value) || 0;
  
  if (vcfCores <= 0) {
    alert('Please enter the number of VCF cores');
    return;
  }
  
  addLog(`<strong>Quick Sizing Calculation Started</strong>`, 'header');
  addLog(`Input: ${vcfCores} VCF cores`);
  addLog(`Formula: 1 Service Unit (SU) per 100 VCF cores (100:1 ratio)`);
  addLog(`Calculation: ${vcfCores} ÷ 100 = ${(vcfCores / 100).toFixed(2)}`);
  
  const estimatedSUs = Math.ceil(vcfCores / 100);
  addLog(`Result rounded up: ${estimatedSUs} SUs`);
  addLog(`<strong>This is a baseline estimate for early planning stages.</strong>`, 'success');
  
  document.getElementById('quick-sus').textContent = estimatedSUs;
  document.getElementById('quick-results').classList.remove('hidden');
  calculationData.quickSizing = { vcfCores, estimatedSUs };
  
  displayQuickLogs();
}

// Advanced Sizing with Comprehensive Logging
function calculateAdvanced() {
  clearLogs();
  addLog(`<strong>Advanced Sizing Calculation Started</strong>`, 'header');
  
  ['dc-prod', 'dc-nonprod', 'dr-prod', 'dr-nonprod'].forEach(env => storeCurrentYearData(env));
  
  const gslb = {
    sites: parseInt(document.getElementById('gslb-sites').value) || 0,
    dnsRpsDc: parseInt(document.getElementById('gslb-dns-rps-dc').value) || 0,
    dnsRpsDr: parseInt(document.getElementById('gslb-dns-rps-dr').value) || 0,
    vcpu: parseInt(document.getElementById('gslb-vcpu').value) || 2
  };
  
  const arch = {
    regions: parseInt(document.getElementById('arch-regions').value) || 1,
    orgs: parseInt(document.getElementById('arch-orgs').value) || 1,
    vpcs: parseInt(document.getElementById('arch-vpcs').value) || 1,
    vcpu: parseInt(document.getElementById('arch-vcpu').value) || 2,
    buffer: parseFloat(document.getElementById('arch-buffer').value) || 20,
    segModel: calculationData.arch.segModel || 'shared',
    haConfig: calculationData.arch.haConfig || 'elastic'
  };
  
  addLog(`<strong>Architecture Configuration:</strong>`);
  addLog(`• Regions: ${arch.regions} | Organizations: ${arch.orgs} | VPCs: ${arch.vpcs}`);
  addLog(`• SE vCPU Size: ${arch.vcpu} | Buffer: ${arch.buffer}%`);
  addLog(`• SEG Model: ${arch.segModel} | HA: ${arch.haConfig}`);
  
  const results = { years: {}, gslb: calculateGSLB(gslb), arch: arch, controllers: {} };
  
  for (let year = 1; year <= 3; year++) {
    addLog(`<br><strong>=== YEAR ${year} CALCULATION ===</strong>`, 'header');
    const yearKey = `year${year}`;
    results.years[yearKey] = {
      dcProd: calculateEnvironmentRequirements('dc-prod', year, arch),
      dcNonprod: calculateEnvironmentRequirements('dc-nonprod', year, arch),
      drProd: calculateEnvironmentRequirements('dr-prod', year, arch),
      drNonprod: calculateEnvironmentRequirements('dr-nonprod', year, arch)
    };
  }
  
  results.controllers = calculateControllers(results);
  displayAdvancedResults(results);
  displayAdvancedLogs();
  calculationData.advancedResults = results;
  showSection('results');
}

// Environment calculation with detailed logging
function calculateEnvironmentRequirements(env, year, arch) {
  const envNames = {
    'dc-prod': 'DC Production',
    'dc-nonprod': 'DC Non-Production',
    'dr-prod': 'DR Production',
    'dr-nonprod': 'DR Non-Production'
  };
  
  addLog(`<br><strong>${envNames[env]} (Year ${year})</strong>`, 'subheader');
  
  const yearKey = `year${year}`;
  const envData = calculationData.environments[env][yearKey];
  
  if (!envData || Object.keys(envData).length === 0) {
    addLog(`⊘ No data entered for this environment`, 'warning');
    return { sus: 0, ses: 0, details: null };
  }
  
  addLog(`Inputs: SSL=${envData.sslThroughput || 0}Gbps (${envData.sslTps || 0} TPS ${envData.sslType || 'RSA2K'}), L7=${envData.l7Throughput || 0}Gbps (${envData.l7Rps || 0} RPS), L4=${envData.l4Throughput || 0}Gbps (${envData.l4Cps || 0} CPS)`);
  
  const waf = calculationData.environments[env].waf || false;
  const throughputVcpus = calculateThroughputVcpus(envData, waf, env);
  const transactionVcpus = calculateTransactionVcpus(envData, env);
  const requiredVcpus = Math.max(throughputVcpus, transactionVcpus);
  
  if (requiredVcpus === 0) {
    addLog(`⊘ No capacity required (all inputs are zero)`, 'warning');
    return { sus: 0, ses: 0, details: null };
  }
  
  addLog(`<strong>Step 6: Choose Bottleneck</strong> → Taking MAX(${throughputVcpus.toFixed(2)}, ${transactionVcpus.toFixed(2)}) = <span class="log-value">${requiredVcpus.toFixed(2)} vCPUs</span>`);
  
  const bufferedVcpus = requiredVcpus * (1 + arch.buffer / 100);
  addLog(`<strong>Step 7: Apply Buffer</strong> → ${requiredVcpus.toFixed(2)} × (1 + ${arch.buffer}%) = <span class="log-value">${bufferedVcpus.toFixed(2)} vCPUs</span>`);
  
  let activeSEs = Math.ceil(bufferedVcpus / arch.vcpu);
  addLog(`<strong>Step 8: Calculate Active SEs</strong> → ceil(${bufferedVcpus.toFixed(2)} ÷ ${arch.vcpu}) = <span class="log-value">${activeSEs} active SEs</span>`);
  
  let totalSEs = (arch.haConfig === 'legacy') ? (activeSEs * 2) : (activeSEs + 1);
  addLog(`<strong>Step 9: Add HA Redundancy</strong> → ${arch.haConfig === 'legacy' ? `${activeSEs} × 2 (Active/Standby)` : `${activeSEs} + 1 (N+1)`} = <span class="log-value">${totalSEs} total SEs</span>`);
  
  let sus = totalSEs * arch.vcpu;
  addLog(`<strong>Step 10: Calculate SUs</strong> → ${totalSEs} SEs × ${arch.vcpu} vCPU = <span class="log-value">${sus} SUs</span>`);
  
  if (arch.segModel === 'dedicated') {
    sus = sus * arch.orgs;
    totalSEs = totalSEs * arch.orgs;
    addLog(`<strong>Step 11: Dedicated SEG Multiplier</strong> → ${sus / arch.orgs} × ${arch.orgs} orgs = <span class="log-value">${sus} SUs</span>`);
  }
  
  if (arch.vpcs > CAPACITY.MAX_VRFS_PER_SE) {
    const vpcBlocks = Math.ceil(arch.vpcs / CAPACITY.MAX_VRFS_PER_SE);
    const additionalSUs = (vpcBlocks - 1) * arch.vcpu;
    sus += additionalSUs;
    totalSEs += (vpcBlocks - 1);
    addLog(`<strong>Step 12: VPC/VRF Density</strong> → ${arch.vpcs} VPCs requires ${vpcBlocks} SE groups (max 9 VRFs/SE). Added ${additionalSUs} SUs. New total: <span class="log-value">${sus} SUs</span>`);
  }
  
  addLog(`<div class="log-result">✓ ${envNames[env]} Final: ${sus} SUs (${totalSEs} SEs)</div>`);
  
  return { sus: Math.ceil(sus), ses: totalSEs, details: { throughputVcpus, transactionVcpus, requiredVcpus, bufferedVcpus, activeSEs, waf, data: envData } };
}

function calculateThroughputVcpus(envData, waf, envName) {
  const sslGbps = envData.sslThroughput || 0;
  const l7Gbps = envData.l7Throughput || 0;
  const l4Gbps = envData.l4Throughput || 0;
  
  addLog(`<strong>Step 1: Throughput-Based vCPU Calculation</strong>`);
  const l4Equivalent = l4Gbps / CAPACITY.L4_GBPS;
  const l7Vcpus = Math.max(sslGbps, l7Gbps) / CAPACITY.L7_SSL_GBPS;
  
  addLog(`• L7/SSL: max(${sslGbps}, ${l7Gbps}) ÷ ${CAPACITY.L7_SSL_GBPS} = ${l7Vcpus.toFixed(2)} vCPUs`);
  addLog(`• L4: ${l4Gbps} ÷ ${CAPACITY.L4_GBPS} = ${l4Equivalent.toFixed(2)} vCPUs`);
  
  let peakVcpus = Math.max(l7Vcpus, l4Equivalent);
  addLog(`• Peak: max(${l7Vcpus.toFixed(2)}, ${l4Equivalent.toFixed(2)}) = ${peakVcpus.toFixed(2)} vCPUs`);
  
  if (waf && peakVcpus > 0) {
    addLog(`<strong>Step 2: WAF Multiplier</strong> → ${peakVcpus.toFixed(2)} × ${CAPACITY.WAF_MULTIPLIER} = ${(peakVcpus * CAPACITY.WAF_MULTIPLIER).toFixed(2)} vCPUs`);
    peakVcpus = peakVcpus * CAPACITY.WAF_MULTIPLIER;
  }
  
  return peakVcpus;
}

function calculateTransactionVcpus(envData, envName) {
  const sslTps = envData.sslTps || 0;
  const sslType = envData.sslType || 'rsa2k';
  const l7Rps = envData.l7Rps || 0;
  const l4Cps = envData.l4Cps || 0;
  
  addLog(`<strong>Step 3: Transaction-Based vCPU Calculation</strong>`);
  
  const sslTpsCapacity = (sslType === 'ecc') ? CAPACITY.SSL_TPS_ECC : CAPACITY.SSL_TPS_RSA2K;
  const sslVcpus = sslTps / sslTpsCapacity;
  const l7Vcpus = l7Rps / CAPACITY.L7_RPS;
  const l4Vcpus = l4Cps / CAPACITY.L4_CPS;
  
  addLog(`• SSL TPS: ${sslTps} ÷ ${sslTpsCapacity} (${sslType.toUpperCase()}) = ${sslVcpus.toFixed(2)} vCPUs`);
  addLog(`• L7 RPS: ${l7Rps} ÷ ${CAPACITY.L7_RPS} = ${l7Vcpus.toFixed(2)} vCPUs`);
  addLog(`• L4 CPS: ${l4Cps} ÷ ${CAPACITY.L4_CPS} = ${l4Vcpus.toFixed(2)} vCPUs`);
  
  const maxTx = Math.max(sslVcpus, l7Vcpus, l4Vcpus);
  addLog(`<strong>Step 4: Transaction Peak</strong> → max(${sslVcpus.toFixed(2)}, ${l7Vcpus.toFixed(2)}, ${l4Vcpus.toFixed(2)}) = ${maxTx.toFixed(2)} vCPUs`);
  
  return maxTx;
}

function calculateGSLB(gslb) {
  if (gslb.sites === 0) {
    addLog(`<br><strong>GSLB Calculation:</strong> No GSLB sites configured`);
    return { sus: 0, ses: 0 };
  }
  
  addLog(`<br><strong>GSLB Calculation:</strong>`);
  addLog(`• Sites: ${gslb.sites} | vCPU per SE: ${gslb.vcpu}`);
  addLog(`• Rule: ${CAPACITY.GSLB_SE_PER_SITE} SEs per site`);
  
  const totalSEs = gslb.sites * CAPACITY.GSLB_SE_PER_SITE;
  const sus = totalSEs * gslb.vcpu;
  
  addLog(`• Calculation: ${gslb.sites} sites × ${CAPACITY.GSLB_SE_PER_SITE} SEs × ${gslb.vcpu} vCPU = <span class="log-value">${sus} SUs</span>`);
  addLog(`<div class="log-result">✓ GSLB Total: ${sus} SUs (${totalSEs} SEs)</div>`);
  
  return { sus, ses: totalSEs, sites: gslb.sites, vcpu: gslb.vcpu };
}

function calculateControllers(results) {
  let totalApps = 0;
  ['dc-prod', 'dc-nonprod', 'dr-prod', 'dr-nonprod'].forEach(env => {
    for (let year = 1; year <= 3; year++) {
      const yearKey = `year${year}`;
      const envData = calculationData.environments[env][yearKey];
      totalApps += envData.apps || 0;
    }
  });
  
  addLog(`<br><strong>Controller Sizing:</strong>`);
  addLog(`• Total Applications: ${totalApps}`);
  
  let controllerSize = 'Small';
  if (totalApps > CAPACITY.CONTROLLER_LARGE) controllerSize = 'Extra Large';
  else if (totalApps > CAPACITY.CONTROLLER_MEDIUM) controllerSize = 'Large';
  else if (totalApps > CAPACITY.CONTROLLER_SMALL) controllerSize = 'Medium';
  
  const controllersPerRegion = 3;
  const totalControllers = controllersPerRegion * results.arch.regions;
  
  addLog(`• Recommended Size: <span class="log-value">${controllerSize}</span>`);
  addLog(`• Controllers per Region (HA): ${controllersPerRegion} nodes`);
  addLog(`• Total Controllers: ${results.arch.regions} regions × ${controllersPerRegion} = <span class="log-value">${totalControllers} nodes</span>`);
  
  return { totalApps, controllerSize, controllersPerRegion, totalControllers, regions: results.arch.regions };
}

function displayQuickLogs() {
  let logsHtml = '<div class="log-card"><div class="log-header"><div class="log-header-title">Quick Sizing Calculation Log</div></div><div class="log-content">';
  
  calculationData.logs.forEach((log, idx) => {
    logsHtml += `<div class="log-step"><div class="log-step-title"><span class="log-step-number">${idx + 1}</span>${log.message}</div></div>`;
  });
  
  logsHtml += '</div></div>';
  document.getElementById('logs-content').innerHTML = logsHtml;
}

function displayAdvancedLogs() {
  let logsHtml = '<div class="alert alert-success"><svg viewBox="0 0 36 36" fill="currentColor"><path d="M18 2a16 16 0 1 0 16 16A16 16 0 0 0 18 2zm0 30a14 14 0 1 1 14-14 14 14 0 0 1-14 14z"/><path d="M28 10l-13 13-7-7 1.4-1.4 5.6 5.6L26.6 8.6z"/></svg><div><strong>Calculation Complete!</strong> All sizing calculations finished successfully. Review the detailed logs below.</div></div>';
  
  logsHtml += '<div class="log-card"><div class="log-header"><div class="log-header-title">Complete Calculation Log</div><span class="log-badge gslb">Advanced Mode</span></div><div class="log-content">';
  
  calculationData.logs.forEach(log => {
    if (log.type === 'header') {
      logsHtml += `<div style="font-size: 16px; font-weight: 600; color: var(--clr-color-action-700); margin: var(--cds-global-space-8) 0 var(--cds-global-space-6) 0; padding-bottom: var(--cds-global-space-5); border-bottom: 2px solid var(--clr-color-action-600);">${log.message}</div>`;
    } else if (log.type === 'subheader') {
      logsHtml += `<div style="font-size: 14px; font-weight: 600; color: var(--clr-color-neutral-900); margin: var(--cds-global-space-7) 0 var(--cds-global-space-5) 0;">${log.message}</div>`;
    } else {
      logsHtml += `<div class="log-step-content">${log.message}</div>`;
    }
  });
  
  logsHtml += '</div></div>';
  document.getElementById('logs-content').innerHTML = logsHtml;
}

function displayAdvancedResults(results) {
  const yearTotals = {};
  for (let year = 1; year <= 3; year++) {
    const yearKey = `year${year}`;
    const yearData = results.years[yearKey];
    const dcTotal = yearData.dcProd.sus + yearData.dcNonprod.sus;
    const drTotal = yearData.drProd.sus + yearData.drNonprod.sus;
    const siteTotal = dcTotal + drTotal;
    const totalWithRegions = siteTotal * results.arch.regions;
    const grandTotal = totalWithRegions + results.gslb.sus;
    yearTotals[yearKey] = { dcProd: yearData.dcProd.sus, dcNonprod: yearData.dcNonprod.sus, drProd: yearData.drProd.sus, drNonprod: yearData.drNonprod.sus, dcTotal, drTotal, siteTotal, totalWithRegions, grandTotal };
  }
  
  const html = `
    <div class="card">
      <div class="card-header"><svg viewBox="0 0 36 36" fill="currentColor"><path d="M32 5H4c-1.1 0-2 .9-2 2v22c0 1.1.9 2 2 2h28c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zM4 29V7h28v22H4z"/><path d="M7 25h3v-9H7zm6 0h3v-13h-3zm6 0h3v-6h-3zm6 0h3V11h-3z"/></svg><span class="card-title">Multi-Year Service Units Summary</span></div>
      <div class="card-block">
        <div class="results-grid">
          <div class="stat-card primary"><div class="stat-label">Year 1 Total SUs</div><div class="stat-value">${yearTotals.year1.grandTotal}</div><div class="stat-unit">Service Units</div></div>
          <div class="stat-card success"><div class="stat-label">Year 2 Total SUs</div><div class="stat-value">${yearTotals.year2.grandTotal}</div><div class="stat-unit">Service Units</div></div>
          <div class="stat-card warning"><div class="stat-label">Year 3 Total SUs</div><div class="stat-value">${yearTotals.year3.grandTotal}</div><div class="stat-unit">Service Units</div></div>
          <div class="stat-card info"><div class="stat-label">GSLB SUs</div><div class="stat-value">${results.gslb.sus}</div><div class="stat-unit">All Years</div></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><svg viewBox="0 0 36 36" fill="currentColor"><path d="M30 8H6v20h24V8zM8 26V10h20v16H8z"/></svg><span class="card-title">Year 1 Breakdown</span></div>
      <div class="card-block">
        <table class="clr-table">
          <thead><tr><th>Environment</th><th>Production SUs</th><th>Non-Production SUs</th><th>Total per Site</th></tr></thead>
          <tbody>
            <tr><td><strong>Data Center</strong></td><td>${yearTotals.year1.dcProd}</td><td>${yearTotals.year1.dcNonprod}</td><td>${yearTotals.year1.dcTotal}</td></tr>
            <tr><td><strong>DR Site</strong></td><td>${yearTotals.year1.drProd}</td><td>${yearTotals.year1.drNonprod}</td><td>${yearTotals.year1.drTotal}</td></tr>
            <tr style="font-weight: 600; background: var(--clr-color-neutral-50);"><td>Subtotal (per region)</td><td colspan="2"></td><td>${yearTotals.year1.siteTotal}</td></tr>
            <tr><td>Regions</td><td colspan="2">× ${results.arch.regions}</td><td>${yearTotals.year1.totalWithRegions}</td></tr>
            <tr><td>GSLB</td><td colspan="2">${results.gslb.sites} sites</td><td>${results.gslb.sus}</td></tr>
            <tr style="font-weight: 600; background: var(--clr-color-action-50);"><td><strong>GRAND TOTAL</strong></td><td colspan="2"></td><td><strong>${yearTotals.year1.grandTotal} SUs</strong></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><svg viewBox="0 0 36 36" fill="currentColor"><path d="M18 19.84l-6.5 5.28v-8.48L18 11.36l6.5 5.28v8.48L18 19.84z"/></svg><span class="card-title">Controller Requirements</span></div>
      <div class="card-block">
        <table class="clr-table">
          <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>Total Applications</td><td>${results.controllers.totalApps}</td></tr>
            <tr><td>Recommended Controller Size</td><td><strong>${results.controllers.controllerSize}</strong></td></tr>
            <tr><td>Controllers per Region (HA)</td><td>${results.controllers.controllersPerRegion} nodes</td></tr>
            <tr><td>Number of Regions</td><td>${results.controllers.regions}</td></tr>
            <tr style="font-weight: 600; background: var(--clr-color-neutral-50);"><td>Total Controller Nodes</td><td><strong>${results.controllers.totalControllers}</strong></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="alert alert-success"><svg viewBox="0 0 36 36" fill="currentColor"><path d="M18 2a16 16 0 1 0 16 16A16 16 0 0 0 18 2zm0 30a14 14 0 1 1 14-14 14 14 0 0 1-14 14z"/><path d="M28 10l-13 13-7-7 1.4-1.4 5.6 5.6L26.6 8.6z"/></svg><div><strong>Sizing Complete!</strong> Click "Calculation Logs" in the sidebar to see detailed step-by-step explanations of how these Service Units were calculated.</div></div>
  `;
  
  document.getElementById('results-content').innerHTML = html;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('VMware Avi Load Balancer Sizing Calculator initialized with Calculation Logging');
});
