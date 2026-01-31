#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const skillsDir = path.join(process.cwd(), 'skills');

function extractSkillDescription(skillDir) {
  const skillFile = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) {
    return null;
  }
  
  const content = fs.readFileSync(skillFile, 'utf8');
  const frontmatterMatch = content.match(/^---[\s\S]*?---/);
  if (!frontmatterMatch) {
    return null;
  }
  
  const frontmatter = frontmatterMatch[0];
  const descriptionMatch = frontmatter.match(/description:\s*([^\n]+)/);
  if (!descriptionMatch) {
    return null;
  }
  
  const description = descriptionMatch[1].trim().replace(/^"|"$/g, '');
  const metadataMatch = frontmatter.match(/metadata:\s*({[^}]+})/);
  let installLabel = null;
  
  if (metadataMatch) {
    try {
      const metadata = JSON.parse(metadataMatch[1]);
      if (metadata.openclaw && metadata.openclaw.install && metadata.openclaw.install[0]) {
        installLabel = metadata.openclaw.install[0].label;
      }
    } catch (e) {
      // Ignore parsing errors
    }
  }
  
  return { description, installLabel };
}

function main() {
  const skillDescriptions = [];
  
  if (!fs.existsSync(skillsDir)) {
    console.error('Skills directory not found');
    process.exit(1);
  }
  
  const skillNames = fs.readdirSync(skillsDir);
  
  for (const skillName of skillNames) {
    const skillDir = path.join(skillsDir, skillName);
    if (fs.statSync(skillDir).isDirectory()) {
      const result = extractSkillDescription(skillDir);
      if (result && result.description) {
        skillDescriptions.push({
          name: skillName,
          description: result.description,
          installLabel: result.installLabel
        });
      }
    }
  }
  
  console.log('Extracted skill descriptions:');
  console.log('================================');
  
  const translationEntries = [];
  
  for (const skill of skillDescriptions) {
    console.log(`Skill: ${skill.name}`);
    console.log(`Description: ${skill.description}`);
    if (skill.installLabel) {
      console.log(`Install Label: ${skill.installLabel}`);
    }
    console.log('--------------------------------');
    
    translationEntries.push(`  '${skill.description.replace(/'/g, "\\'")}': '${skill.description}',`);
    if (skill.installLabel) {
      translationEntries.push(`  '${skill.installLabel.replace(/'/g, "\\'")}': '${skill.installLabel}',`);
    }
  }
  
  console.log('\nTranslation entries (add to src/i18n/locales/zh_CN.ts):');
  console.log('==================================================');
  console.log(translationEntries.join('\n'));
  
  console.log(`\nTotal skills found: ${skillDescriptions.length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { extractSkillDescription, main };