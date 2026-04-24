import { renderLicenseBadge, renderLicenseLink, renderLicenseSection } from './licenseUtils.js';

export function generateMarkdown(data) {
  return `# ${data.title}
${renderLicenseBadge(data.license)}

## Description
${data.description}

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
${data.toDo ? '- [To Do](#to-do)\n' : ''}- [Test](#test)
- [Contributing](#contributing)
${renderLicenseLink(data.license)}
- [Questions](#questions)
${data.toDo ? `
## To Do
${data.toDo}
` : ''}
## Installation
\`\`\`sh
${data.installation}
\`\`\`

## Usage
${data.usage}

## Test
\`\`\`sh
${data.test}
\`\`\`

## Contributing
${data.contributing}

${renderLicenseSection(data.license)}

## Questions
Questions? Email me at ${data.email}.
See more of my work at [github.com/${data.github}](https://github.com/${data.github}).
`;
}
