{\rtf1\ansi\ansicpg1252\cocoartf2709
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 /**\
 * linkedin.js \'97 human-in-the-loop assistant\
 *\
 * What it does:\
 * - Reads a CSV of leads\
 * - Opens LinkedIn profile URLs one-by-one\
 * - Prints a personalized message template to the console for copy/paste\
 *\
 * What it does NOT do:\
 * - It does not click Connect, send messages, scrape, or automate LinkedIn actions.\
 *   LinkedIn prohibits automated/bot activity and third-party automation tools. See LinkedIn User Agreement / Help Center.\
 */\
\
import fs from "fs";\
import path from "path";\
import puppeteer from "puppeteer";\
\
function parseCSV(csv) \{\
  const [header, ...rows] = csv.trim().split("\\n");\
  const cols = header.split(",");\
  return rows.map(r => \{\
    const values = r.split(",").map(v => v.replace(/^"|"$/g, ""));\
    const obj = \{\};\
    cols.forEach((c, i) => (obj[c] = values[i] ?? ""));\
    return obj;\
  \});\
\}\
\
function render(template, lead) \{\
  return template\
    .replaceAll("\{first\}", lead.first_name || "")\
    .replaceAll("\{company\}", lead.company || "")\
    .replaceAll("\{role\}", lead.role || "")\
    .replaceAll("\{trigger\}", lead.trigger || "")\
    .replaceAll("\{pain_area\}", lead.segment || "execution");\
\}\
\
async function main() \{\
  const leadsPath = path.resolve("assets/data/leads.csv");\
  const msgPath = path.resolve("assets/templates/msg1.txt");\
\
  const leadsCSV = fs.readFileSync(leadsPath, "utf8");\
  const msgTemplate = fs.readFileSync(msgPath, "utf8");\
\
  const leads = parseCSV(leadsCSV)\
    .filter(l => (l.status || "").toUpperCase() === "NEW")\
    .filter(l => (l.linkedin_url || "").startsWith("http"));\
\
  console.log(`Loaded $\{leads.length\} NEW leads.`);\
\
  const browser = await puppeteer.launch(\{ headless: false \});\
  const page = await browser.newPage();\
\
  for (const lead of leads) \{\
    console.log("\\n====================================");\
    console.log(`OPEN: $\{lead.company\} \'97 $\{lead.first_name\} $\{lead.last_name\}`);\
    console.log("COPY/PASTE MESSAGE:");\
    console.log(render(msgTemplate, lead));\
\
    await page.goto(lead.linkedin_url, \{ waitUntil: "domcontentloaded" \});\
    console.log("Action: manually review profile, then send connection request using the message above.");\
    console.log("Press Enter in the terminal to continue to next lead...");\
    await new Promise(resolve => process.stdin.once("data", resolve));\
  \}\
\
  await browser.close();\
\}\
\
main().catch(err => \{\
  console.error(err);\
  process.exit(1);\
\});\
}