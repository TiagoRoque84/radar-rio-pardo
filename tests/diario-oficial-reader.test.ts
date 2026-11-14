import { describe, expect, it } from "vitest";
import { readOfficialListingPrefix } from "../src/lib/collectors/dioe-reader";

const pdf =
  "https://dosp.com.br/diario/sp/sao-jose-do-rio-pardo/2026-11-10/ed-1927-905260-6e42dd74d276.pdf";
const row = (id: number) =>
  '<tr><td>Portaria ' + id + ' - nomeação</td><td>10/11/2026</td>' +
  '<td>1927</td><td>9</td><td><a href="' + pdf +
  '">Abrir Edição</a></td><td>-</td></tr>';
const header =
  '<html><body><h1>Diário Oficial - São José do Rio Pardo</h1>' +
  "<h2>Listar Atos</h2><table>";

function streamOf(chunks: string[]) {
  let cancelled = false;
  let requested = 0;
  const encoder = new TextEncoder();
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      requested++;
      const next = chunks.shift();
      if (next === undefined) controller.close();
      else controller.enqueue(encoder.encode(next));
    },
    cancel() { cancelled = true; },
  }), { headers: { "content-type": "text/html" } });
  return {
    response,
    get cancelled() { return cancelled; },
    get requested() { return requested; },
  };
}

describe("Listagem incremental de atos grandes", () => {
  it("lê 3 portarias recentes sem baixar o HTML histórico de mais de 1 MB", async () => {
    const stream = streamOf([
      header + row(20323) + row(20322) + row(20321),
      "<tr><td>" + "x".repeat(1_200_000) + "</td></tr>",
    ]);
    const result = await readOfficialListingPrefix(stream.response, "Portarias", {
      maxItems: 3, maxBytes: 1_500_000,
    });
    expect(result.items).toHaveLength(3);
    expect(result.stoppedAfterTarget).toBe(true);
    expect(result.hitByteLimit).toBe(false);
    expect(stream.cancelled).toBe(true);
    expect(result.bytesRead).toBeLessThan(1000);
  });

  it("aceita tags HTML divididas em partes sem perder registros", async () => {
    const stream = streamOf([header + row(1).replace("</tr>", "</t"), "r>" + row(2)]);
    const result = await readOfficialListingPrefix(stream.response, "Leis", { maxItems: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.stoppedAfterTarget).toBe(true);
  });

  it("preserva registros parciais e sinaliza limite alcançado", async () => {
    const stream = streamOf([header + row(1) + "<!-- " + "x".repeat(14_000) ]);
    const result = await readOfficialListingPrefix(stream.response, "Portarias", {
      maxItems: 3, maxBytes: 5000,
    });
    expect(result.items).toHaveLength(1);
    expect(result.hitByteLimit).toBe(true);
    expect(result.stoppedAfterTarget).toBe(false);
    expect(result.bytesRead).toBe(5000);
    expect(stream.cancelled).toBe(true);
  });

  it("recusa documento sem cabeçalho de São José do Rio Pardo", async () => {
    const response = new Response(
      "<h1>Diário Oficial Mococa</h1><h2>Listar Atos</h2><table>" + row(1)
    );
    await expect(readOfficialListingPrefix(response, "Portarias"))
      .rejects.toThrow(/São José do Rio Pardo/);
  });

  it("falha sem inventar atos quando atinge limite antes da primeira linha", async () => {
    const stream = streamOf([header + "<div>" + "x".repeat(20_000)]);
    await expect(readOfficialListingPrefix(stream.response, "Portarias", {
      maxBytes: 4096,
    })).rejects.toThrow("LISTING_BYTE_LIMIT_NO_VALID_ROWS");
  });
});
