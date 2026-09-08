import JSZip from "jszip";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Real Excel charts in the workbook
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────
 *
 * ExcelJS has no `addChart` and never has. Every visual in the workbook was
 * therefore built out of cells and conditional formatting, which is honest but
 * is not what a dashboard looks like — and the owner asked, in as many words,
 * for the exported sheet to carry the same dashboards the screen does.
 *
 * The alternative to a chart API is not "no charts". An .xlsx IS A ZIP of XML
 * parts, and a chart is four of them: the chart itself, a drawing that anchors
 * it to a sheet, the relationships between the two, and a content-type entry.
 * So the workbook is built with ExcelJS exactly as before, and then this file
 * opens the finished zip and adds those parts.
 *
 * The result is a NATIVE chart. Right-click → Edit Data works, it re-draws
 * when the numbers behind it change, it prints, and it survives Google Sheets
 * and LibreOffice. That is the thing an embedded PNG could never be, and the
 * reason images were refused in the first place.
 *
 * ── THE RULES THAT KEEP EXCEL FROM REFUSING THE FILE ─────────────────────
 *
 * Excel does not tolerate a malformed part: one element out of sequence and
 * the whole workbook opens as "we found a problem with some content", with no
 * clue which part. Three things must be right and are easy to get wrong:
 *
 *  1. **Child order is fixed by the schema**, not by taste. `c:barChart` is
 *     barDir, grouping, varyColors, ser…, dLbls, gapWidth, overlap, axId,
 *     axId — in that order. Every builder below writes its children in schema
 *     order and nothing is appended "while we are here".
 *  2. **Every series carries a cached copy of its values** as well as the cell
 *     reference. The reference is what makes the chart live; the cache is what
 *     lets it draw before Excel has recalculated, and what makes it survive a
 *     hidden source sheet.
 *  3. **`<drawing>` goes near the END of a worksheet part**, after pageSetup
 *     and before tableParts/extLst. Put it at the top and the sheet is
 *     rejected.
 *
 * Everything written here is validated on the way out — see
 * `.scratch/xlsx-verify` while it exists — by reopening the produced file with
 * a completely different library and counting the charts it finds.
 */

// ─── what a caller describes ──────────────────────────────────────────────

export type SeriesKind = "column" | "bar" | "line";

export type ChartSeries = {
  name: string;
  /** Absolute reference to the values, e.g. `'Chart data'!$B$2:$B$9`. */
  ref: string;
  values: number[];
  /** One colour for the whole series. */
  colour?: string;
  /** A colour per point — for pie and doughnut, and for bars worth varying. */
  pointColours?: string[];
  /** For combination charts. Defaults to the chart's own kind. */
  kind?: SeriesKind;
  labels?: "none" | "value" | "percent";
  /** A flat reference line rather than a plotted series (the period average). */
  dashed?: boolean;
};

export type ChartSpec = {
  kind: "column" | "bar" | "pie" | "doughnut";
  title: string;
  /** Absolute reference to the category labels. */
  catRef: string;
  categories: string[];
  series: ChartSeries[];
  /** Zero-based cell anchor. `toRow`/`toCol` are exclusive, as OOXML wants. */
  anchor: { fromCol: number; fromRow: number; toCol: number; toRow: number };
  legend?: "b" | "r" | "none";
  /** Number format for the value axis and the data labels. */
  numFmt?: string;
  /** Bar/column only. Excel's default is 150, which wastes half the plot. */
  gapWidth?: number;
  /** Doughnut only, 10–90. */
  holeSize?: number;
  /** Printed under the chart by the sheet builder; the chart itself ignores it. */
  note?: string;
};

// ─── XML helpers ──────────────────────────────────────────────────────────

const NS_C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_XDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Excel rejects control characters outright; a party name pasted from a
    // spreadsheet can carry one and nobody would ever guess that was the cause.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/** `FF2D3F8F` (ExcelJS ARGB) or `2D3F8F` — DrawingML wants the six digits. */
const rgb = (argb: string) => (argb.length === 8 ? argb.slice(2) : argb).toUpperCase();

const num = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : "0");

function strCache(values: string[]): string {
  return (
    `<c:strCache><c:ptCount val="${values.length}"/>` +
    values.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join("") +
    `</c:strCache>`
  );
}

function numCache(values: number[], fmt: string): string {
  return (
    `<c:numCache><c:formatCode>${esc(fmt)}</c:formatCode><c:ptCount val="${values.length}"/>` +
    values.map((v, i) => `<c:pt idx="${i}"><c:v>${num(v)}</c:v></c:pt>`).join("") +
    `</c:numCache>`
  );
}

const solidFill = (argb: string) => `<a:solidFill><a:srgbClr val="${rgb(argb)}"/></a:solidFill>`;

const INK = "16181D";
const INK3 = "7A8291";
const RULE = "DDDFE3";

/** Small grey axis/label text, so a chart does not shout over its own title. */
function txPr(size = 900, colour = INK3, bold = false): string {
  return (
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr>` +
    `<a:defRPr sz="${size}" b="${bold ? 1 : 0}">${solidFill(colour)}<a:latin typeface="Aptos Narrow"/></a:defRPr>` +
    `</a:pPr><a:endParaRPr lang="en-IN"/></a:p></c:txPr>`
  );
}

function titleXml(text: string): string {
  return (
    `<c:title><c:tx><c:rich><a:bodyPr rot="0" spcFirstLastPara="1" vertOverflow="ellipsis" vert="horz" wrap="square" anchor="ctr" anchorCtr="1"/><a:lstStyle/>` +
    `<a:p><a:pPr><a:defRPr sz="1100" b="1">${solidFill(INK)}<a:latin typeface="Aptos Display"/></a:defRPr></a:pPr>` +
    `<a:r><a:rPr lang="en-IN" sz="1100" b="1"/><a:t>${esc(text)}</a:t></a:r></a:p>` +
    `</c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
  );
}

/**
 * Data labels. Order inside `c:dLbls` is fixed: numFmt, spPr, txPr, dLblPos,
 * then the five show* flags, and every one of the flags must be present —
 * Excel treats a missing `showBubbleSize` as a broken part, not a default.
 */
function dLbls(kind: ChartSeries["labels"], fmt: string, pos?: string): string {
  if (!kind || kind === "none") return `<c:dLbls><c:delete val="1"/></c:dLbls>`;
  const percent = kind === "percent";
  return (
    `<c:dLbls>` +
    (percent ? "" : `<c:numFmt formatCode="${esc(fmt)}" sourceLinked="0"/>`) +
    `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>` +
    txPr(850, INK) +
    (pos ? `<c:dLblPos val="${pos}"/>` : "") +
    `<c:showLegendKey val="0"/>` +
    `<c:showVal val="${percent ? 0 : 1}"/>` +
    `<c:showCatName val="0"/>` +
    `<c:showSerName val="0"/>` +
    `<c:showPercent val="${percent ? 1 : 0}"/>` +
    `<c:showBubbleSize val="0"/>` +
    `</c:dLbls>`
  );
}

function catXml(ref: string, categories: string[]): string {
  return `<c:cat><c:strRef><c:f>${esc(ref)}</c:f>${strCache(categories)}</c:strRef></c:cat>`;
}

function valXml(ref: string, values: number[], fmt: string): string {
  return `<c:val><c:numRef><c:f>${esc(ref)}</c:f>${numCache(values, fmt)}</c:numRef></c:val>`;
}

function txXml(name: string): string {
  return `<c:tx><c:v>${esc(name)}</c:v></c:tx>`;
}

/** Per-point colours, for a pie or a bar chart worth varying. */
function dPts(colours: string[] | undefined, count: number): string {
  if (!colours?.length) return "";
  let out = "";
  for (let i = 0; i < count; i++) {
    const c = colours[i % colours.length];
    out +=
      `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/>` +
      `<c:spPr>${solidFill(c)}<a:ln w="12700">${solidFill("FFFFFF")}</a:ln></c:spPr></c:dPt>`;
  }
  return out;
}

// ─── the chart part ───────────────────────────────────────────────────────

/**
 * `c:ser` children are schema-ordered per chart type, and the orders differ:
 *
 *   bar   idx order tx spPr invertIfNegative pictureOptions dPt dLbls … cat val
 *   line  idx order tx spPr marker dPt dLbls … cat val smooth
 *   pie   idx order tx spPr explosion dPt dLbls cat val
 *
 * Writing one order for all three is the single easiest way to produce a file
 * Excel refuses, so each has its own builder rather than a shared one with
 * flags.
 */
function barSer(s: ChartSeries, idx: number, spec: ChartSpec, fmt: string): string {
  const pos = spec.kind === "bar" ? "outEnd" : "outEnd";
  return (
    `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/>${txXml(s.name)}` +
    `<c:spPr>${s.colour ? solidFill(s.colour) : "<a:noFill/>"}<a:ln><a:noFill/></a:ln></c:spPr>` +
    `<c:invertIfNegative val="0"/>` +
    dPts(s.pointColours, s.values.length) +
    dLbls(s.labels, fmt, pos) +
    catXml(spec.catRef, spec.categories) +
    valXml(s.ref, s.values, fmt) +
    `</c:ser>`
  );
}

function lineSer(s: ChartSeries, idx: number, spec: ChartSpec, fmt: string): string {
  const dash = s.dashed ? `<a:prstDash val="dash"/>` : "";
  return (
    `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/>${txXml(s.name)}` +
    `<c:spPr><a:ln w="22225" cap="rnd">${solidFill(s.colour ?? INK)}${dash}<a:round/></a:ln><a:effectLst/></c:spPr>` +
    `<c:marker><c:symbol val="${s.dashed ? "none" : "circle"}"/><c:size val="5"/>` +
    `<c:spPr>${solidFill(s.colour ?? INK)}<a:ln w="9525">${solidFill("FFFFFF")}</a:ln></c:spPr></c:marker>` +
    dLbls(s.labels, fmt) +
    catXml(spec.catRef, spec.categories) +
    valXml(s.ref, s.values, fmt) +
    `<c:smooth val="0"/>` +
    `</c:ser>`
  );
}

function pieSer(s: ChartSeries, idx: number, spec: ChartSpec, fmt: string): string {
  return (
    `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/>${txXml(s.name)}` +
    `<c:spPr><a:ln w="12700">${solidFill("FFFFFF")}</a:ln></c:spPr>` +
    dPts(s.pointColours ?? [s.colour ?? INK], s.values.length) +
    // ── NO dLblPos ON A DOUGHNUT. THIS IS THE ONE THAT BROKE EXCEL ───────
    //
    // A pie accepts `bestFit`; a DOUGHNUT accepts no `c:dLblPos` at all, and
    // Excel does not warn about it — it refuses the whole workbook with "we
    // found a problem with some content" and names no part. openpyxl read the
    // same file back happily, which is why this got shipped: a library
    // round-trip proves the XML parses, not that Excel accepts it. The five
    // workbooks with a share panel were rejected; production-status, the one
    // with no doughnut in it, opened fine. That was the tell.
    dLbls(s.labels ?? "percent", fmt, spec.kind === "pie" ? "bestFit" : undefined) +
    catXml(spec.catRef, spec.categories) +
    valXml(s.ref, s.values, fmt) +
    `</c:ser>`
  );
}

function axes(catId: number, valId: number, horizontal: boolean, fmt: string): string {
  // A horizontal bar chart puts the categories down the left and the values
  // along the bottom, so the two axes swap position but not identity.
  const catPos = horizontal ? "l" : "b";
  const valPos = horizontal ? "b" : "l";
  const gridlines = `<c:majorGridlines><c:spPr><a:ln w="9525">${solidFill(RULE)}<a:prstDash val="sysDot"/></a:ln></c:spPr></c:majorGridlines>`;
  return (
    `<c:catAx><c:axId val="${catId}"/><c:scaling><c:orientation val="minMax"/></c:scaling>` +
    `<c:delete val="0"/><c:axPos val="${catPos}"/>` +
    `<c:numFmt formatCode="General" sourceLinked="0"/>` +
    `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>` +
    `<c:spPr><a:ln w="9525">${solidFill(RULE)}</a:ln></c:spPr>` +
    txPr() +
    `<c:crossAx val="${valId}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="${valId}"/><c:scaling><c:orientation val="minMax"/></c:scaling>` +
    `<c:delete val="0"/><c:axPos val="${valPos}"/>` +
    gridlines +
    `<c:numFmt formatCode="${esc(fmt)}" sourceLinked="0"/>` +
    `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>` +
    `<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>` +
    txPr() +
    `<c:crossAx val="${catId}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`
  );
}

function chartXml(spec: ChartSpec, n: number): string {
  const fmt = spec.numFmt ?? "#,##0";
  const catId = 100_000_000 + n * 10;
  const valId = catId + 1;
  const legend =
    spec.legend === "none"
      ? ""
      : `<c:legend><c:legendPos val="${spec.legend ?? "b"}"/><c:overlay val="0"/>${txPr()}</c:legend>`;

  let plot: string;

  if (spec.kind === "pie" || spec.kind === "doughnut") {
    const tag = spec.kind === "pie" ? "c:pieChart" : "c:doughnutChart";
    plot =
      `<${tag}><c:varyColors val="1"/>` +
      spec.series.map((s, i) => pieSer(s, i, spec, fmt)).join("") +
      `<c:firstSliceAng val="0"/>` +
      (spec.kind === "doughnut" ? `<c:holeSize val="${spec.holeSize ?? 55}"/>` : "") +
      `</${tag}>`;
  } else {
    // A combination chart is two chart groups in one plot area sharing the
    // same pair of axis ids. Bars first so the line draws on top of them.
    const bars = spec.series.filter((s) => (s.kind ?? spec.kind) !== "line");
    const lines = spec.series.filter((s) => (s.kind ?? spec.kind) === "line");
    const horizontal = spec.kind === "bar";

    const barGroup = bars.length
      ? `<c:barChart><c:barDir val="${horizontal ? "bar" : "col"}"/><c:grouping val="clustered"/><c:varyColors val="0"/>` +
        bars.map((s, i) => barSer(s, i, spec, fmt)).join("") +
        `<c:gapWidth val="${spec.gapWidth ?? 60}"/><c:overlap val="-15"/>` +
        `<c:axId val="${catId}"/><c:axId val="${valId}"/></c:barChart>`
      : "";

    const lineGroup = lines.length
      ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>` +
        lines.map((s, i) => lineSer(s, bars.length + i, spec, fmt)).join("") +
        `<c:marker val="1"/>` +
        `<c:axId val="${catId}"/><c:axId val="${valId}"/></c:lineChart>`
      : "";

    plot = barGroup + lineGroup + axes(catId, valId, horizontal, fmt);
  }

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
    `<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}">` +
    `<c:date1904 val="0"/><c:lang val="en-IN"/><c:roundedCorners val="0"/>` +
    `<c:chart>` +
    titleXml(spec.title) +
    `<c:plotArea><c:layout/>${plot}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>` +
    legend +
    `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>` +
    `</c:chart>` +
    `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525">${solidFill(RULE)}</a:ln></c:spPr>` +
    txPr() +
    `</c:chartSpace>`
  );
}

// ─── the drawing part ─────────────────────────────────────────────────────

function drawingXml(specs: ChartSpec[]): string {
  const anchors = specs
    .map((s, i) => {
      const a = s.anchor;
      return (
        `<xdr:twoCellAnchor>` +
        `<xdr:from><xdr:col>${a.fromCol}</xdr:col><xdr:colOff>38100</xdr:colOff><xdr:row>${a.fromRow}</xdr:row><xdr:rowOff>19050</xdr:rowOff></xdr:from>` +
        // Offsets must be >= 0. A negative one is schema-legal and Excel
        // treats it as a damaged anchor, so the inset lives on the FROM corner.
        `<xdr:to><xdr:col>${a.toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
        `<xdr:graphicFrame macro="">` +
        `<xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Chart ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
        `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
        `<a:graphic><a:graphicData uri="${NS_C}">` +
        `<c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="rId${i + 1}"/>` +
        `</a:graphicData></a:graphic>` +
        `</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`
      );
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
    `<xdr:wsDr xmlns:xdr="${NS_XDR}" xmlns:a="${NS_A}">${anchors}</xdr:wsDr>`
  );
}

// ─── stitching it into the finished zip ───────────────────────────────────

const REL_CHART = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart";
const REL_DRAWING = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing";
const CT_CHART = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
const CT_DRAWING = "application/vnd.openxmlformats-officedocument.drawing+xml";

/** Which `xl/worksheets/sheetN.xml` is the sheet with this name. */
async function resolveSheetPath(zip: JSZip, sheetName: string): Promise<string> {
  const wb = await zip.file("xl/workbook.xml")?.async("string");
  if (!wb) throw new Error("workbook.xml missing");
  const re = new RegExp(`<sheet[^>]*name="${sheetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*/>`);
  const tag = wb.match(re)?.[0];
  if (!tag) throw new Error(`sheet "${sheetName}" not found`);
  const rid = tag.match(/r:id="([^"]+)"/)?.[1];
  if (!rid) throw new Error(`sheet "${sheetName}" has no relationship id`);

  const rels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!rels) throw new Error("workbook rels missing");
  const relRe = new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*/>`);
  const relTag = rels.match(relRe)?.[0];
  const target = relTag?.match(/Target="([^"]+)"/)?.[1];
  if (!target) throw new Error(`relationship ${rid} not found`);
  return "xl/" + target.replace(/^\/?xl\//, "").replace(/^\.\//, "");
}

/**
 * Adds `specs` as native charts on `sheetName` of an already-built workbook.
 *
 * The workbook is untouched apart from the four parts a chart needs, so this
 * can never change a figure — worth saying, because a post-processing step
 * that rewrites cells is exactly the kind of thing that silently breaks a
 * total between the sheet and the dashboard.
 */
export async function injectCharts(
  buffer: ArrayBuffer | Buffer,
  sheetName: string,
  specs: ChartSpec[],
): Promise<Buffer> {
  if (!specs.length) return Buffer.from(buffer as ArrayBuffer);

  const zip = await JSZip.loadAsync(buffer);
  const sheetPath = await resolveSheetPath(zip, sheetName);
  const sheetFile = sheetPath.split("/").pop()!;

  // ── 1. the chart parts ─────────────────────────────────────────────────
  specs.forEach((spec, i) => {
    zip.file(`xl/charts/chart${i + 1}.xml`, chartXml(spec, i));
  });

  // ── 2. the drawing, and what it points at ──────────────────────────────
  zip.file("xl/drawings/drawing1.xml", drawingXml(specs));
  zip.file(
    "xl/drawings/_rels/drawing1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      specs
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="${REL_CHART}" Target="../charts/chart${i + 1}.xml"/>`,
        )
        .join("") +
      `</Relationships>`,
  );

  // ── 3. the sheet's own relationship to that drawing ────────────────────
  const relPath = `xl/worksheets/_rels/${sheetFile}.rels`;
  const existing = await zip.file(relPath)?.async("string");
  let drawingRid = "rId1";
  if (existing) {
    // Never reuse an id — ExcelJS writes hyperlink relationships into this
    // same file, and a collision silently repoints somebody's link at a chart.
    const used = [...existing.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
    drawingRid = `rId${(used.length ? Math.max(...used) : 0) + 1}`;
    zip.file(
      relPath,
      existing.replace(
        "</Relationships>",
        `<Relationship Id="${drawingRid}" Type="${REL_DRAWING}" Target="../drawings/drawing1.xml"/></Relationships>`,
      ),
    );
  } else {
    zip.file(
      relPath,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="${drawingRid}" Type="${REL_DRAWING}" Target="../drawings/drawing1.xml"/>` +
        `</Relationships>`,
    );
  }

  // ── 4. point the sheet at it, in the one place the schema allows ───────
  let sheetXml = await zip.file(sheetPath)!.async("string");
  if (!/xmlns:r=/.test(sheetXml)) {
    sheetXml = sheetXml.replace("<worksheet ", `<worksheet xmlns:r="${NS_R}" `);
  }
  const drawingTag = `<drawing r:id="${drawingRid}"/>`;
  const before = ["<tableParts", "<extLst", "<legacyDrawing"].find((t) => sheetXml.includes(t));
  sheetXml = before
    ? sheetXml.replace(before, drawingTag + before)
    : sheetXml.replace("</worksheet>", drawingTag + "</worksheet>");
  zip.file(sheetPath, sheetXml);

  // ── 5. declare the new content types ───────────────────────────────────
  let ct = await zip.file("[Content_Types].xml")!.async("string");
  const overrides =
    specs
      .map(
        (_, i) => `<Override PartName="/xl/charts/chart${i + 1}.xml" ContentType="${CT_CHART}"/>`,
      )
      .join("") + `<Override PartName="/xl/drawings/drawing1.xml" ContentType="${CT_DRAWING}"/>`;
  ct = ct.replace("</Types>", overrides + "</Types>");
  zip.file("[Content_Types].xml", ct);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
