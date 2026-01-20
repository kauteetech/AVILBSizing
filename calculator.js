// VMware Avi Load Balancer Sizing Calculator - Complete Logic
// Includes: TPS/RPS/CPS, Multi-year, Pre-PROD, Controller sizing

// Global state management
const calculationData = {
  // Environments: dc-prod, dc-nonprod, dr-prod, dr-nonprod
  environments: {
    'dc-prod': { year1: {}, year2: {}, year3: {}, waf: false },
    'dc-nonprod': { year1: {}, year2: {}, year3: {}, waf: false },
    'dr-prod': { year1: {}, year2: {}, year3: {}, waf: false },
    'dr-nonprod': { year1: {}, year2: {}, year3: {}, waf: false }
  },
  arch: { segModel: 'shared', haConfig: 'elastic' },
  currentYears: {
    'dc-prod': 1,
    'dc-nonprod': 1,
    'dr-prod': 1,
    'dr-nonprod': 1
  },
  quickSizing: null,
  advancedResults: null
};

// Capacity constants (per vCPU)
const CAPACITY = {
  // Throughput
  L7_SSL_GBPS: 1.0,      // 1 Gbps L7 SSL per vCPU
  L4_GBPS: 2.0,          // 2 Gbps L4 per vCPU

  // Transactions
  SSL_TPS_RSA2K: 2000,   // SSL TPS (RSA 2K) per vCPU
  SSL_TPS_ECC: 4000,     // SSL TPS (ECC) per vCPU
  L7_RPS: 40000,         // L7 requests/sec per vCPU
  L4_CPS: 100000,        // L4 connections/sec per vCPU

  // Special
  WAF_MULTIPLIER: 6,     // 6 SUs per 1 Gbps WAF traffic
  GSLB_SE_PER_SITE: 2,   // 2 SEs per GSLB site
  MAX_VRFS_PER_SE: 9,    // Max 9 VRFs per SE

  // Controller sizing (apps per controller type)
  CONTROLLER_SMALL: 200,    // Up to 200 apps
  CONTROLLER_MEDIUM: 1000,  // Up to 1000 apps
  CONTROLLER_LARGE: 5000    // Up to 5000 apps
};

// Navigation
function showSection(section) {
  document.querySelectorAll('.nav-link').forEach((item) => item.classList.remove('active'));
  const navItem = document.querySelector(`.nav-link[data-section="${section}"]`);
  if (navItem) navItem.classList.add('active');

  ['quick', 'advanced', 'results', 'guide'].forEach((s) => {
    const el = document.getElementById(`${s}-section`);
    if (el) el.classList.toggle('hidden', s !== section);
  });
}

function showTab(tab) {
  document.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
  const tabEl = document.querySelector(`.nav-tab[data-tab="${tab}"]`);
  if (tabEl) tabEl.classList.add('active');

  ['dc-prod', 'dc-nonprod', 'dr-prod', 'dr-nonprod', 'gslb', 'architecture'].forEach((t) => {
    const el = document.getElementById(`${t}-tab`);
    if (el) el.classList.toggle('hidden', t !== tab);
  });
}

// Year selection for multi-year planning
function selectYear(env, year) {
  calculationData.currentYears[env] = year;

  // Update year tab UI
  const tabContainer = document.querySelector(`#${env}-tab .year-tabs`);
  if (tabContainer) {
    tabContainer.querySelectorAll('.year-tab').forEach((tab, idx) => {
      tab.classList.toggle('active', idx + 1 === year);
    });
  }

  // Store current values before switching
  storeCurrentYearData(env);

  // Load year data
  loadYearData(env, year);
}

// Store current form values to the active year
function storeCurrentYearData(env) {
  const currentYear = calculationData.currentYears[env];
  const yearKey = `year${currentYear}`;

  const inputs = document.querySelectorAll(`[data-env="${env}"]`);
  inputs.forEach(input => {
    const field = input.dataset.field;
    if (field) {
      if (input.tagName === 'SELECT') {
        calculationData.environments[env][yearKey][field] = input.value;
      } else {
        calculationData.environments[env][yearKey][field] = parseFloat(input.value) || 0;
      }
    }
  });
}

// Load year data into form
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

// Toggle options
function toggleOption(element, env, field, value) {
  const group = element?.parentElement;
  if (group) group.querySelectorAll('.toggle-btn').forEach((btn) => btn.classList.remove('active'));
  element.classList.add('active');

  if (env === 'arch') {
    calculationData.arch[field] = value;
  } else {
    calculationData.environments[env][field] = value;
  }
}

// Quick Sizing Calculation
function calculateQuick() {
  const vcfCores = parseFloat(document.getElementById('vcf-cores').value) || 0;
  if (vcfCores <= 0) {
    alert('Please enter the number of VCF cores');
    return;
  }

  const estimatedSUs = Math.ceil(vcfCores / 100);
  document.getElementById('quick-sus').textContent = estimatedSUs;
  document.getElementById('quick-results').classList.remove('hidden');

  calculationData.quickSizing = { vcfCores, estimatedSUs };
}

// Advanced Sizing Calculation
function calculateAdvanced() {
  // Store current form values
  ['dc-prod', 'dc-nonprod', 'dr-prod', 'dr-nonprod'].forEach(env => {
    storeCurrentYearData(env);
  });

  // Collect GSLB data
  const gslb = {
    sites: parseInt(document.getElementById('gslb-sites').value) || 0,
    dnsRpsDc: parseInt(document.getElementById('gslb-dns-rps-dc').value) || 0,
    dnsRpsDr: parseInt(document.getElementById('gslb-dns-rps-dr').value) || 0,
    vcpu: parseInt(document.getElementById('gslb-vcpu').value) || 2
  };

  // Collect architecture data
  const arch = {
    regions: parseInt(document.getElementById('arch-regions').value) || 1,
    orgs: parseInt(document.getElementById('arch-orgs').value) || 1,
    vpcs: parseInt(document.getElementById('arch-vpcs').value) || 1,
    vcpu: parseInt(document.getElementById('arch-vcpu').value) || 2,
    buffer: parseFloat(document.getElementById('arch-buffer').value) || 20,
    segModel: calculationData.arch.segModel || 'shared',
    haConfig: calculationData.arch.haConfig || 'elastic'
  };

  // Calculate for all years and environments
  const results = {
    years: {},
    gslb: calculateGSLB(gslb),
    arch: arch,
    controllers: {}
  };

  // Calculate for each year
  for (let year = 1; year <= 3; year++) {
    const yearKey = `year${year}`;
    results.years[yearKey] = {
      dcProd: calculateEnvironmentRequirements('dc-prod', year, arch),
      dcNonprod: calculateEnvironmentRequirements('dc-nonprod', year, arch),
      drProd: calculateEnvironmentRequirements('dr-prod', year, arch),
      drNonprod: calculateEnvironmentRequirements('dr-nonprod', year, arch)
    };
  }

  // Calculate controller requirements
  results.controllers = calculateControllers(results);

  // Display results
  displayAdvancedResults(results);
  calculationData.advancedResults = results;
  showSection('results');
}

// Calculate environment requirements (comprehensive)
function calculateEnvironmentRequirements(env, year, arch) {
  const yearKey = `year${year}`;
  const envData = calculationData.environments[env][yearKey];

  if (!envData || Object.keys(envData).length === 0) {
    return { sus: 0, ses: 0, details: null };
  }

  const waf = calculationData.environments[env].waf || false;

  // Calculate required vCPUs based on throughput
  const throughputVcpus = calculateThroughputVcpus(envData, waf);

  // Calculate required vCPUs based on transactions (TPS/RPS/CPS)
  const transactionVcpus = calculateTransactionVcpus(envData);

  // Take the maximum (bottleneck)
  const requiredVcpus = Math.max(throughputVcpus, transactionVcpus);

  if (requiredVcpus === 0) {
    return { sus: 0, ses: 0, details: null };
  }

  // Apply buffer/headroom
  const bufferedVcpus = requiredVcpus * (1 + arch.buffer / 100);

  // Calculate number of SEs based on vCPU size
  let activeSEs = Math.ceil(bufferedVcpus / arch.vcpu);

  // Add HA redundancy
  let totalSEs = (arch.haConfig === 'legacy') ? (activeSEs * 2) : (activeSEs + 1);

  // Calculate SUs
  let sus = totalSEs * arch.vcpu;

  // Apply dedicated SEG multiplier
  if (arch.segModel === 'dedicated') {
    sus = sus * arch.orgs;
    totalSEs = totalSEs * arch.orgs;
  }

  // Apply VPC/VRF density constraint
  if (arch.vpcs > CAPACITY.MAX_VRFS_PER_SE) {
    const vpcBlocks = Math.ceil(arch.vpcs / CAPACITY.MAX_VRFS_PER_SE);
    const additionalSUs = (vpcBlocks - 1) * arch.vcpu;
    sus += additionalSUs;
    totalSEs += (vpcBlocks - 1);
  }

  return {
    sus: Math.ceil(sus),
    ses: totalSEs,
    details: {
      throughputVcpus,
      transactionVcpus,
      requiredVcpus,
      bufferedVcpus,
      activeSEs,
      waf,
      data: envData
    }
  };
}

// Calculate vCPUs required for throughput
function calculateThroughputVcpus(envData, waf) {
  const sslGbps = envData.sslThroughput || 0;
  const l7Gbps = envData.l7Throughput || 0;
  const l4Gbps = envData.l4Throughput || 0;

  // L4 is more efficient (2 Gbps per vCPU), convert to vCPU equivalent
  const l4Equivalent = l4Gbps / CAPACITY.L4_GBPS;
  const l7Vcpus = Math.max(sslGbps, l7Gbps) / CAPACITY.L7_SSL_GBPS;

  let peakVcpus = Math.max(l7Vcpus, l4Equivalent);

  // Apply WAF multiplier
  if (waf && peakVcpus > 0) {
    peakVcpus = peakVcpus * CAPACITY.WAF_MULTIPLIER;
  }

  return peakVcpus;
}

// Calculate vCPUs required for transactions
function calculateTransactionVcpus(envData) {
  const sslTps = envData.sslTps || 0;
  const sslType = envData.sslType || 'rsa2k';
  const l7Rps = envData.l7Rps || 0;
  const l4Cps = envData.l4Cps || 0;

  // Calculate vCPUs needed for each transaction type
  const sslTpsCapacity = (sslType === 'ecc') ? CAPACITY.SSL_TPS_ECC : CAPACITY.SSL_TPS_RSA2K;
  const sslVcpus = sslTps / sslTpsCapacity;
  const l7Vcpus = l7Rps / CAPACITY.L7_RPS;
  const l4Vcpus = l4Cps / CAPACITY.L4_CPS;

  // Return the maximum (bottleneck)
  return Math.max(sslVcpus, l7Vcpus, l4Vcpus);
}

// Calculate GSLB requirements
function calculateGSLB(gslb) {
  if (gslb.sites === 0) {
    return { sus: 0, ses: 0 };
  }

  const sesPerSite = CAPACITY.GSLB_SE_PER_SITE;
  const totalSEs = gslb.sites * sesPerSite;
  const sus = totalSEs * gslb.vcpu;

  return { sus, ses: totalSEs, sites: gslb.sites, vcpu: gslb.vcpu };
}

// Calculate controller requirements
function calculateControllers(results) {
  let totalApps = 0;

  // Sum applications across all environments and years
  ['dc-prod', 'dc-nonprod', 'dr-prod', 'dr-nonprod'].forEach(env => {
    for (let year = 1; year <= 3; year++) {
      const yearKey = `year${year}`;
      const envData = calculationData.environments[env][yearKey];
      totalApps += envData.apps || 0;
    }
  });

  // Determine controller size
  let controllerSize = 'Small';
  if (totalApps > CAPACITY.CONTROLLER_LARGE) {
    controllerSize = 'Extra Large';
  } else if (totalApps > CAPACITY.CONTROLLER_MEDIUM) {
    controllerSize = 'Large';
  } else if (totalApps > CAPACITY.CONTROLLER_SMALL) {
    controllerSize = 'Medium';
  }

  // Controllers are deployed per region (3 nodes for HA)
  const controllersPerRegion = 3;
  const totalControllers = controllersPerRegion * results.arch.regions;

  return {
    totalApps,
    controllerSize,
    controllersPerRegion,
    totalControllers,
    regions: results.arch.regions
  };
}

// Display comprehensive results
function displayAdvancedResults(results) {
  // Calculate totals for each year
  const yearTotals = {};
  for (let year = 1; year <= 3; year++) {
    const yearKey = `year${year}`;
    const yearData = results.years[yearKey];

    const dcTotal = yearData.dcProd.sus + yearData.dcNonprod.sus;
    const drTotal = yearData.drProd.sus + yearData.drNonprod.sus;
    const siteTotal = dcTotal + drTotal;
    const totalWithRegions = siteTotal * results.arch.regions;
    const grandTotal = totalWithRegions + results.gslb.sus;

    yearTotals[yearKey] = {
      dcProd: yearData.dcProd.sus,
      dcNonprod: yearData.dcNonprod.sus,
      drProd: yearData.drProd.sus,
      drNonprod: yearData.drNonprod.sus,
      dcTotal,
      drTotal,
      siteTotal,
      totalWithRegions,
      grandTotal
    };
  }

  const html = `
    <div class="card">
      <div class="card-header">
        <svg viewBox="0 0 36 36" fill="currentColor">
          <path d="M32 5H4c-1.1 0-2 .9-2 2v22c0 1.1.9 2 2 2h28c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zM4 29V7h28v22H4z"/>
          <path d="M7 25h3v-9H7zm6 0h3v-13h-3zm6 0h3v-6h-3zm6 0h3V11h-3z"/>
        </svg>
        <span class="card-title">Multi-Year Service Units Summary</span>
      </div>
      <div class="card-block">
        <div class="results-grid">
          <div class="stat-card primary">
            <div class="stat-label">Year 1 Total SUs</div>
            <div class="stat-value">${yearTotals.year1.grandTotal}</div>
            <div class="stat-unit">Service Units</div>
          </div>
          <div class="stat-card success">
            <div class="stat-label">Year 2 Total SUs</div>
            <div class="stat-value">${yearTotals.year2.grandTotal}</div>
            <div class="stat-unit">Service Units</div>
          </div>
          <div class="stat-card warning">
            <div class="stat-label">Year 3 Total SUs</div>
            <div class="stat-value">${yearTotals.year3.grandTotal}</div>
            <div class="stat-unit">Service Units</div>
          </div>
          <div class="stat-card info">
            <div class="stat-label">GSLB SUs</div>
            <div class="stat-value">${results.gslb.sus}</div>
            <div class="stat-unit">All Years</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <svg viewBox="0 0 36 36" fill="currentColor">
          <path d="M30 8H6v20h24V8zM8 26V10h20v16H8z"/>
        </svg>
        <span class="card-title">Year 1 Breakdown</span>
      </div>
      <div class="card-block">
        <table class="clr-table">
          <thead>
            <tr>
              <th>Environment</th>
              <th>Production SUs</th>
              <th>Non-Production SUs</th>
              <th>Total per Site</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Data Center</strong></td>
              <td>${yearTotals.year1.dcProd}</td>
              <td>${yearTotals.year1.dcNonprod}</td>
              <td>${yearTotals.year1.dcTotal}</td>
            </tr>
            <tr>
              <td><strong>DR Site</strong></td>
              <td>${yearTotals.year1.drProd}</td>
              <td>${yearTotals.year1.drNonprod}</td>
              <td>${yearTotals.year1.drTotal}</td>
            </tr>
            <tr style="font-weight: 600; background: var(--clr-color-neutral-50);">
              <td>Subtotal (per region)</td>
              <td colspan="2"></td>
              <td>${yearTotals.year1.siteTotal}</td>
            </tr>
            <tr>
              <td>Regions</td>
              <td colspan="2">× ${results.arch.regions}</td>
              <td>${yearTotals.year1.totalWithRegions}</td>
            </tr>
            <tr>
              <td>GSLB</td>
              <td colspan="2">${results.gslb.sites} sites</td>
              <td>${results.gslb.sus}</td>
            </tr>
            <tr style="font-weight: 600; background: var(--clr-color-action-50);">
              <td><strong>GRAND TOTAL</strong></td>
              <td colspan="2"></td>
              <td><strong>${yearTotals.year1.grandTotal} SUs</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <svg viewBox="0 0 36 36" fill="currentColor">
          <path d="M18 19.84l-6.5 5.28v-8.48L18 11.36l6.5 5.28v8.48L18 19.84z"/>
        </svg>
        <span class="card-title">Controller Requirements</span>
      </div>
      <div class="card-block">
        <table class="clr-table">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Total Applications</td>
              <td>${results.controllers.totalApps}</td>
            </tr>
            <tr>
              <td>Recommended Controller Size</td>
              <td><strong>${results.controllers.controllerSize}</strong></td>
            </tr>
            <tr>
              <td>Controllers per Region (HA)</td>
              <td>${results.controllers.controllersPerRegion} nodes</td>
            </tr>
            <tr>
              <td>Number of Regions</td>
              <td>${results.controllers.regions}</td>
            </tr>
            <tr style="font-weight: 600; background: var(--clr-color-neutral-50);">
              <td>Total Controller Nodes</td>
              <td><strong>${results.controllers.totalControllers}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <svg viewBox="0 0 36 36" fill="currentColor">
          <path d="M33 6.5h-1.4c-.1-1.1-.5-2.2-1.1-3.1-.6-.9-1.5-1.6-2.4-2.1-.9-.5-2-.8-3-.8H11.9c-1.1 0-2.1.3-3 .8-.9.5-1.7 1.2-2.4 2.1-.6.9-1 2-1.1 3.1H4c-1.1 0-2 .9-2 2v20c0 1.1.9 2 2 2h1v1c0 1.1.9 2 2 2h22c1.1 0 2-.9 2-2v-1h1c1.1 0 2-.9 2-2v-20c0-1.1-.9-2-2-2z"/>
        </svg>
        <span class="card-title">Architecture Configuration</span>
      </div>
      <div class="card-block">
        <table class="clr-table">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>VCF Regions</td><td>${results.arch.regions}</td></tr>
            <tr><td>Organizations</td><td>${results.arch.orgs}</td></tr>
            <tr><td>VPCs/VRFs</td><td>${results.arch.vpcs}</td></tr>
            <tr><td>SE vCPU Size</td><td>${results.arch.vcpu} vCPU</td></tr>
            <tr><td>SEG Model</td><td>${results.arch.segModel}</td></tr>
            <tr><td>HA Configuration</td><td>${results.arch.haConfig}</td></tr>
            <tr><td>Capacity Buffer</td><td>${results.arch.buffer}%</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="alert alert-success">
      <svg viewBox="0 0 36 36" fill="currentColor">
        <path d="M18 2a16 16 0 1 0 16 16A16 16 0 0 0 18 2zm0 30a14 14 0 1 1 14-14 14 14 0 0 1-14 14z"/>
        <path d="M28 10l-13 13-7-7 1.4-1.4 5.6 5.6L26.6 8.6z"/>
      </svg>
      <div>
        <strong>Comprehensive Sizing Complete:</strong> This calculation includes throughput AND transaction rate limits (TPS/RPS/CPS), 
        multi-year capacity planning, production and non-production environments, GSLB, controller sizing, and all VCF 9 
        architectural constraints (regions, VPCs, SEG models, HA redundancy).
      </div>
    </div>
  `;

  document.getElementById('results-content').innerHTML = html;
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  console.log('VMware Avi Load Balancer Sizing Calculator (Complete Edition) initialized');
  console.log('Includes: TPS/RPS/CPS, Multi-year planning, Pre-PROD, Controller sizing');
});
