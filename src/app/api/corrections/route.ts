import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { correctionRequestSchema } from "@/lib/validators";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = correctionRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ||
            "Verifique os campos preenchidos.",
        },
        { status: 400 }
      );
    }

    const created = await prisma.correctionRequest.create({
      data: {
        requesterName: parsed.data.requesterName,
        requesterEmail: parsed.data.requesterEmail,
        requestType: parsed.data.requestType,
        targetUrl: parsed.data.targetUrl || null,
        articleId: parsed.data.articleId || null,
        actId: parsed.data.actId || null,
        description: parsed.data.description,
        status: "OPEN",
      },
    });

    return NextResponse.json(
      {
        id: created.id,
        message:
          "Solicitação registrada com sucesso. Nossa equipe editorial analisará o pedido com transparência.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao registrar solicitação de correção:", error);
    return NextResponse.json(
      { error: "Não foi possível registrar sua solicitação no momento." },
      { status: 500 }
    );
  }
}
