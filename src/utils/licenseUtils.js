export function renderLicenseBadge(license) {
  if (!license || license === 'None') return '';
  return `![License](https://img.shields.io/badge/license-${encodeURIComponent(license)}-blue.svg)`;
}

export function renderLicenseLink(license) {
  if (!license || license === 'None') return '';
  return '- [License](#license)';
}

export function renderLicenseSection(license) {
  if (!license || license === 'None') return '';
  return `## License\nThis project is licensed under the ${license} license.`;
}
