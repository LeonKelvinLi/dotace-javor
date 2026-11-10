import type {
  Category,
  Contract,
  Item,
  Organization,
  StoredFile,
} from "./model";
import { categoryLabels, declaration, money, total } from "./model";

export type SettlementReport = {
  contract: Contract;
  organization: Organization;
  items: Item[];
  files: StoredFile[];
};

const decisionLabels = {
  pending: "K posouzení",
  accepted: "Akceptováno",
  rejected: "Neuznáno",
  supplement: "Vyžádáno doplnění",
};
const reviewLabels = {
  unchecked: "Nezkontrolováno",
  checked: "Zkontrolováno",
  commented: "Zkontrolováno s komentářem",
};
const statusLabels = {
  draft: "Rozpracováno",
  submitted: "Ke kontrole SFJ",
  changes: "K doplnění",
  approved: "Schváleno",
};
const fileLabels = {
  receipt: "Doklad",
  contract: "Podepsaná smlouva",
  instructions: "Pokyny SFJ",
  decision: "Rozhodnutí ASP",
  amendment: "Dodatek",
};
function clean(text: unknown): string {
  return String(text ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[\t\u00a0\u202f]/g, " ")
    .replace(/\r\n?/g, "\n");
}
function reportDate(value: string): string {
  if (!value) return "Neuvedeno";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("cs-CZ");
}

/** Build an A4 report. Optional font bytes permit offline fixture verification. */
export async function makeSettlementPdf(
  { contract, organization, items, files }: SettlementReport,
  options: { fontBytes?: Uint8Array; generatedAt?: Date } = {},
): Promise<Uint8Array> {
  const [{ PDFDocument, PageSizes, rgb }, fontkitModule] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
  ]);
  let fontBytes = options.fontBytes;
  if (!fontBytes) {
    const response = await fetch("/fonts/NotoSans-Regular.ttf", {
      credentials: "same-origin",
    });
    if (!response.ok)
      throw new Error(
        "Nepodařilo se načíst písmo pro PDF. Zkuste stažení znovu.",
      );
    fontBytes = new Uint8Array(await response.arrayBuffer());
  }
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkitModule.default);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const generatedAt = options.generatedAt ?? new Date();
  pdf.setTitle(`Vyúčtování dotace ${contract.number} · ${organization.name}`);
  pdf.setAuthor("Sportovní federace Javor · Dotace");
  pdf.setSubject("Fiktivní pilotní vyúčtování dotace");
  pdf.setCreator("Dotace · SFJ");
  pdf.setCreationDate(generatedAt);

  const [pageWidth, pageHeight] = PageSizes.A4;
  const margin = 42;
  const bottom = 49;
  const contentWidth = pageWidth - 2 * margin;
  const ink = rgb(0.13, 0.24, 0.18);
  const green = rgb(0.2, 0.36, 0.26);
  const muted = rgb(0.43, 0.5, 0.41);
  const line = rgb(0.85, 0.89, 0.82);
  const tint = rgb(0.96, 0.97, 0.94);
  let page = pdf.addPage(PageSizes.A4);
  let y = pageHeight - margin;
  let pageNumber = 1;

  function draw(value: string, x: number, top: number, size = 9, color = ink) {
    page.drawText(clean(value), { x, y: top - size, size, font, color });
  }
  function newPage() {
    page = pdf.addPage(PageSizes.A4);
    pageNumber += 1;
    y = pageHeight - margin;
    draw("SFJ / DOTACE", margin, y, 8, green);
    const label = clean(contract.number);
    const fit =
      font.widthOfTextAtSize(label, 8) <= contentWidth - 100
        ? label
        : "Vyúčtování dotace";
    draw(fit, pageWidth - margin - font.widthOfTextAtSize(fit, 8), y, 8, muted);
    y -= 23;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.6,
      color: line,
    });
    y -= 18;
  }
  function ensure(height: number) {
    if (y - height < bottom) newPage();
  }
  function wrap(value: unknown, width = contentWidth, size = 9): string[] {
    const paragraphs = clean(value).split("\n");
    const result: string[] = [];
    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) {
        result.push("");
        continue;
      }
      let current = "";
      for (const word of paragraph.trim().split(/\s+/)) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) {
          current = candidate;
          continue;
        }
        if (current) {
          result.push(current);
          current = "";
        }
        if (font.widthOfTextAtSize(word, size) <= width) {
          current = word;
          continue;
        }
        // Document numbers and file names can be a single very long token.
        for (const character of Array.from(word)) {
          const part = current + character;
          if (current && font.widthOfTextAtSize(part, size) > width) {
            result.push(current);
            current = character;
          } else current = part;
        }
      }
      if (current) result.push(current);
    }
    return result;
  }
  function paragraph(
    value: unknown,
    {
      size = 9,
      color = ink,
      indent = 0,
      after = 7,
    }: {
      size?: number;
      color?: ReturnType<typeof rgb>;
      indent?: number;
      after?: number;
    } = {},
  ) {
    const leading = size * 1.55;
    for (const text of wrap(value, contentWidth - indent, size)) {
      ensure(leading);
      if (text) draw(text, margin + indent, y, size, color);
      y -= leading;
    }
    y -= after;
  }
  function section(title: string) {
    ensure(56);
    y -= 10;
    draw(title, margin, y, 12, green);
    y -= 23;
  }
  function rule() {
    ensure(14);
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.5,
      color: line,
    });
    y -= 14;
  }
  function detail(label: string, value: unknown) {
    paragraph(`${label}: ${clean(value) || "Neuvedeno"}`, {
      size: 8.5,
      after: 4,
    });
  }

  draw("SFJ / DOTACE", margin, y, 11, green);
  draw(
    "FIKTIVNÍ PILOTNÍ DATA",
    pageWidth - margin - font.widthOfTextAtSize("FIKTIVNÍ PILOTNÍ DATA", 7),
    y + 1,
    7,
    muted,
  );
  y -= 31;
  paragraph("Vyúčtování dotace", { size: 22, color: green, after: 6 });
  paragraph(organization.name, { size: 16, after: 6 });
  detail(
    "Smlouva",
    `${contract.number} · ${contract.program} · ${contract.year}`,
  );
  detail("Organizace", `IČO ${organization.ico} · ${organization.address}`);
  detail("Stav vyúčtování", statusLabels[contract.status]);
  detail(
    "Období úhrad",
    `${reportDate(contract.validFrom)} – ${reportDate(contract.validTo)}`,
  );
  detail("Termín vyúčtování", reportDate(contract.deadline));
  y -= 8;

  const figures: [string, number][] = [
    ["Přidělená dotace", contract.amount],
    ["Uplatněné náklady", total(items)],
    ["Krácení dotace", contract.reduction],
    ["Dotace po krácení", Math.max(0, contract.amount - contract.reduction)],
  ];
  ensure(103);
  const cellWidth = contentWidth / 2;
  for (let row = 0; row < 2; row++) {
    page.drawRectangle({
      x: margin,
      y: y - 44,
      width: contentWidth,
      height: 44,
      color: tint,
    });
    for (let col = 0; col < 2; col++) {
      const [label, amount] = figures[row * 2 + col];
      draw(label, margin + col * cellWidth + 12, y - 6, 7.5, muted);
      draw(money(amount), margin + col * cellWidth + 12, y - 21, 13, green);
    }
    y -= 44;
  }
  y -= 11;

  section("Souhrn podle skupin nákladů");
  const columns = [margin + 9, margin + 264, margin + 309, margin + 413];
  function groupRow(
    label: string,
    count: number | string,
    claimed: number | string,
    accepted: number | string,
    header = false,
  ) {
    const lines = wrap(label, 245, header ? 8 : 9);
    const rowHeight = Math.max(27, lines.length * 14 + 10);
    ensure(rowHeight);
    if (header)
      page.drawRectangle({
        x: margin,
        y: y - rowHeight,
        width: contentWidth,
        height: rowHeight,
        color: tint,
      });
    lines.forEach((text, index) =>
      draw(
        text,
        columns[0],
        y - 7 - index * 14,
        header ? 8 : 9,
        header ? muted : ink,
      ),
    );
    [
      String(count),
      typeof claimed === "number" ? money(claimed) : claimed,
      typeof accepted === "number" ? money(accepted) : accepted,
    ].forEach((text, index) => {
      draw(
        text,
        columns[index + 1],
        y - 7,
        header ? 7.5 : 8,
        header ? muted : ink,
      );
    });
    y -= rowHeight;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.4,
      color: line,
    });
  }
  groupRow("Skupina nákladů", "Počet", "Uplatněno", "Akceptováno", true);
  for (const category of Object.keys(categoryLabels) as Category[]) {
    const active = items.filter(
      (item) => !item.excluded && item.category === category,
    );
    groupRow(
      categoryLabels[category],
      active.length,
      total(active),
      total(active.filter((item) => item.sfjDecision === "accepted")),
    );
  }
  groupRow(
    "Celkem",
    items.filter((item) => !item.excluded).length,
    total(items),
    total(items.filter((item) => item.sfjDecision === "accepted")),
  );
  y -= 5;
  paragraph(
    "Vyřazené položky se do součtů nezapočítávají. Akceptované částky vycházejí z jednotlivých rozhodnutí SFJ.",
    { size: 7.5, color: muted },
  );

  section("Doklady vyúčtování");
  if (!items.length)
    paragraph("Vyúčtování zatím neobsahuje žádný doklad.", { color: muted });
  for (const [index, item] of items.entries()) {
    ensure(102);
    paragraph(
      `${index + 1}. ${item.number || "Bez čísla dokladu"} · ${item.supplier || "Dodavatel neuveden"}`,
      { size: 11, color: green, after: 5 },
    );
    if (item.excluded)
      paragraph("VYŘAZENO Z VYÚČTOVÁNÍ – částka není zahrnuta v součtech.", {
        size: 8,
        color: muted,
        after: 5,
      });
    paragraph(item.description || "Popis nákladu neuveden.", {
      size: 9,
      after: 6,
    });
    detail("Skupina nákladů", categoryLabels[item.category]);
    detail(
      "Částky",
      `Doklad ${money(item.amount)} · Uplatněno ${money(item.claimed)}`,
    );
    detail(
      "Úhrada",
      `${reportDate(item.date)} · ${item.payment === "bank" ? "Banka" : "Hotovost"}`,
    );
    if (item.supplierIco) detail("IČO dodavatele", item.supplierIco);
    detail(
      "Odběratel",
      item.recipientType === "none"
        ? "Bez uvedení odběratele"
        : `${item.recipientType === "person" ? "Osoba" : item.recipientType === "other" ? "Jiná firma" : "Organizace"}${item.recipientName ? ` · ${item.recipientName}` : ""}`,
    );
    detail("Kontrola organizace", reviewLabels[item.orgReview]);
    detail(
      "Posouzení SFJ",
      item.excluded ? "Vyřazeno" : decisionLabels[item.sfjDecision],
    );
    if (item.comment) detail("Komentář organizace", item.comment);
    if (item.sfjReason) detail("Vyjádření SFJ", item.sfjReason);
    const attachmentNames = item.fileIds.map(
      (id) => files.find((file) => file.id === id)?.name ?? `Příloha ${id}`,
    );
    detail(
      "Přílohy",
      attachmentNames.length ? attachmentNames.join("; ") : "Chybí příloha",
    );
    y -= 4;
    rule();
  }

  section("Prohlášení příjemce dotace");
  paragraph(declaration, { size: 9 });
  paragraph(
    contract.declaredAt
      ? `Potvrzeno: ${contract.declaredBy} · ${new Date(contract.declaredAt).toLocaleString("cs-CZ")}`
      : "Vyúčtování dosud nebylo odesláno; prohlášení nebylo potvrzeno.",
    { size: 8, color: muted },
  );
  section("Závěr kontroly SFJ");
  paragraph(contract.conclusion || "Kontrola dosud nebyla uzavřena.", {
    size: 9,
  });
  const rejected = total(
    items.filter((item) => item.sfjDecision === "rejected"),
  );
  detail("Neuznané položky", money(rejected));
  detail("Krácení dotace", money(contract.reduction));
  paragraph(
    "SFJ provádí formální kontrolu; organizace odpovídá za věcnou správnost a skutečné uskutečnění plnění.",
    { size: 8, color: muted },
  );

  const sourceFiles = files.filter(
    (file) => file.contractId === contract.id && file.kind !== "receipt",
  );
  if (sourceFiles.length) {
    section("Zdrojové dokumenty smlouvy");
    for (const file of sourceFiles)
      paragraph(`${fileLabels[file.kind]}: ${file.name}`, {
        size: 8,
        after: 5,
      });
  }

  for (const [index, pdfPage] of pdf.getPages().entries()) {
    pdfPage.drawLine({
      start: { x: margin, y: 35 },
      end: { x: pageWidth - margin, y: 35 },
      thickness: 0.5,
      color: line,
    });
    pdfPage.drawText(
      `SFJ · Fiktivní pilotní údaje · Vytvořeno ${generatedAt.toLocaleString("cs-CZ")}`,
      { x: margin, y: 22, size: 6.5, font, color: muted },
    );
    const number = `${index + 1} / ${pageNumber}`;
    pdfPage.drawText(number, {
      x: pageWidth - margin - font.widthOfTextAtSize(number, 7),
      y: 22,
      size: 7,
      font,
      color: muted,
    });
  }
  return pdf.save();
}

export async function downloadSettlementPdf(
  report: SettlementReport,
): Promise<void> {
  const bytes = await makeSettlementPdf(report);
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${report.contract.number.replace(/[^a-zA-Z0-9_-]/g, "-")}-vyuctovani.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
