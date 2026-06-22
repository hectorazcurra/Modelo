"""
Gera apresentação PowerPoint com os dois slides do sistema Modelo.
Uso: python3 scripts/gerar-apresentacao.py
Saída: /tmp/Modelo-Apresentacao.pptx
"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_AUTO_SHAPE_TYPE, MSO_CONNECTOR_TYPE
from pptx.util import Inches, Pt
import pptx.oxml.ns as nsmap
from lxml import etree

# ── Paleta ──────────────────────────────────────────────────────────────────
AZUL_ESCURO  = RGBColor(0x1E, 0x3A, 0x5F)   # títulos / cabeçalhos
AZUL_MEDIO   = RGBColor(0x26, 0x6B, 0xC4)   # fase 1 borda
AZUL_CLARO   = RGBColor(0xE8, 0xF1, 0xFB)   # fase 1 fundo
VERDE_ESCURO = RGBColor(0x14, 0x53, 0x2D)   # fase 2 borda
VERDE_CLARO  = RGBColor(0xE6, 0xF4, 0xEA)   # fase 2 fundo
CINZA_BORDA  = RGBColor(0xCC, 0xCC, 0xCC)
CINZA_FUNDO  = RGBColor(0xF5, 0xF5, 0xF5)
BRANCO       = RGBColor(0xFF, 0xFF, 0xFF)
TEXTO        = RGBColor(0x1A, 0x1A, 0x1A)
LARANJA      = RGBColor(0xF0, 0x7B, 0x00)   # setas / destaques

SLIDE_W = Inches(13.33)
SLIDE_H = Inches(7.5)


def prs_new():
    prs = Presentation()
    prs.slide_width  = SLIDE_W
    prs.slide_height = SLIDE_H
    return prs


def add_rect(slide, l, t, w, h, fill=None, border=None, border_w=Pt(1.5), radius=None):
    shape = slide.shapes.add_shape(
        MSO_AUTO_SHAPE_TYPE.RECTANGLE,
        l, t, w, h
    )
    shape.line.width = border_w
    if fill:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill
    else:
        shape.fill.background()
    if border:
        shape.line.color.rgb = border
    else:
        shape.line.fill.background()
    return shape


def add_rounded_rect(slide, l, t, w, h, fill, border, border_w=Pt(2), text='', font_size=Pt(11), bold=False, text_color=None):
    shape = slide.shapes.add_shape(
        MSO_AUTO_SHAPE_TYPE.ROUNDED_RECTANGLE,
        l, t, w, h
    )
    shape.adjustments[0] = 0.05
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.width = border_w
    shape.line.color.rgb = border
    if text:
        tf = shape.text_frame
        tf.word_wrap = True
        tf.auto_size = None
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        run = p.add_run()
        run.text = text
        run.font.size = font_size
        run.font.bold = bold
        run.font.color.rgb = text_color or TEXTO
    return shape


def set_tf(shape, text, size=Pt(10), bold=False, color=None, align=PP_ALIGN.CENTER, wrap=True):
    tf = shape.text_frame
    tf.word_wrap = wrap
    tf.auto_size = None
    # clear
    for i in range(len(tf.paragraphs) - 1, 0, -1):
        p = tf.paragraphs[i]._p
        p.getparent().remove(p)
    p = tf.paragraphs[0]
    p.alignment = align
    p.runs[0].text = '' if p.runs else ''
    # add lines
    lines = text.split('\n')
    for idx, line in enumerate(lines):
        if idx == 0:
            if p.runs:
                run = p.runs[0]
            else:
                run = p.add_run()
            run.text = line
            run.font.size = size
            run.font.bold = bold
            run.font.color.rgb = color or TEXTO
        else:
            from pptx.oxml.ns import qn
            from copy import deepcopy
            new_p = deepcopy(p._p)
            # clear runs
            for r in new_p.findall(qn('a:r')):
                new_p.remove(r)
            tf._txBody.append(new_p)
            new_para = tf.paragraphs[-1]
            new_para.alignment = align
            run = new_para.add_run()
            run.text = line
            run.font.size = size
            run.font.bold = bold
            run.font.color.rgb = color or TEXTO


def add_label(slide, l, t, w, h, text, size=Pt(10), bold=False, color=None, align=PP_ALIGN.CENTER):
    txb = slide.shapes.add_textbox(l, t, w, h)
    tf = txb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size = size
    run.font.bold = bold
    run.font.color.rgb = color or TEXTO
    return txb


def add_arrow(slide, x1, y1, x2, y2, color=LARANJA, width=Pt(2)):
    """Seta simples de (x1,y1) para (x2,y2)."""
    from pptx.util import Emu
    connector = slide.shapes.add_connector(
        MSO_CONNECTOR_TYPE.STRAIGHT,
        x1, y1, x2, y2
    )
    connector.line.width = width
    connector.line.color.rgb = color
    # end arrowhead
    from pptx.oxml.ns import qn
    ln = connector.line._ln
    tailEnd = ln.find(qn('a:tailEnd'))
    if tailEnd is None:
        tailEnd = etree.SubElement(ln, qn('a:tailEnd'))
    headEnd = ln.find(qn('a:headEnd'))
    if headEnd is None:
        headEnd = etree.SubElement(ln, qn('a:headEnd'))
    headEnd.set('type', 'triangle')
    headEnd.set('w', 'med')
    headEnd.set('len', 'med')


# ════════════════════════════════════════════════════════════════════════════
# SLIDE 1 — Construção do Banco de Dados
# ════════════════════════════════════════════════════════════════════════════
def slide1(prs):
    layout = prs.slide_layouts[6]  # blank
    slide = prs.slides.add_slide(layout)

    # Fundo branco
    bg = slide.background
    bg.fill.solid()
    bg.fill.fore_color.rgb = BRANCO

    # ── Título ──────────────────────────────────────────────────────────────
    add_label(slide,
        Inches(0.3), Inches(0.15), Inches(12.7), Inches(0.55),
        'Construção do Banco de Dados Histórico',
        size=Pt(24), bold=True, color=AZUL_ESCURO, align=PP_ALIGN.LEFT
    )
    add_label(slide,
        Inches(0.3), Inches(0.65), Inches(12.7), Inches(0.3),
        'Como os dados dos OS são extraídos e armazenados para alimentar a IA',
        size=Pt(13), color=RGBColor(0x55, 0x55, 0x55), align=PP_ALIGN.LEFT
    )

    # ── Divisor ─────────────────────────────────────────────────────────────
    div = add_rect(slide, Inches(0.3), Inches(0.95), Inches(12.73), Inches(0.03),
                   fill=AZUL_MEDIO, border=AZUL_MEDIO)

    # ════════════════════════════════════
    # FASE 1 — caixa azul (left 2/3)
    # ════════════════════════════════════
    F1_L = Inches(0.25)
    F1_T = Inches(1.1)
    F1_W = Inches(8.5)
    F1_H = Inches(5.9)

    fase1_box = add_rect(slide, F1_L, F1_T, F1_W, F1_H,
                         fill=AZUL_CLARO, border=AZUL_MEDIO, border_w=Pt(2))

    add_label(slide, F1_L + Inches(0.1), F1_T + Inches(0.05), Inches(4), Inches(0.35),
              '⬛  FASE 1 · Carga Inicial  (one-time)',
              size=Pt(11), bold=True, color=AZUL_MEDIO, align=PP_ALIGN.LEFT)

    # — FUP —
    fup = add_rounded_rect(slide,
        F1_L + Inches(0.25), F1_T + Inches(0.5),
        Inches(2.4), Inches(0.85),
        fill=BRANCO, border=AZUL_MEDIO,
        text='📊  FUP Metodo.xlsx\nÍndice: 285 OS de 2026',
        font_size=Pt(10), bold=False
    )

    # — Pasta OS —
    pasta_l = F1_L + Inches(3.2)
    pasta_t = F1_T + Inches(0.45)
    pasta_box = add_rect(slide, pasta_l, pasta_t, Inches(2.8), Inches(2.4),
                         fill=CINZA_FUNDO, border=CINZA_BORDA, border_w=Pt(1.2))
    add_label(slide, pasta_l + Inches(0.05), pasta_t + Inches(0.05), Inches(2.7), Inches(0.28),
              'Pasta de cada OS', size=Pt(9), bold=True,
              color=RGBColor(0x44, 0x44, 0x44), align=PP_ALIGN.LEFT)

    pastas = ['📁 01. Doc. Recebidos', '📁 02. Orçamento  (Pricing*.xlsx)',
              '📁 03. Proposta', '📁 04. Contrato', '📁 05. Execução']
    for i, p_txt in enumerate(pastas):
        add_label(slide,
            pasta_l + Inches(0.12), pasta_t + Inches(0.38 + i * 0.38),
            Inches(2.55), Inches(0.35),
            p_txt, size=Pt(9), align=PP_ALIGN.LEFT)

    # — Script —
    script_l = F1_L + Inches(0.2)
    script_t = F1_T + Inches(1.8)
    script_box = add_rounded_rect(slide,
        script_l, script_t, Inches(2.5), Inches(0.7),
        fill=AZUL_MEDIO, border=AZUL_MEDIO,
        text='⚙️  import-historico.ts',
        font_size=Pt(10), bold=True, text_color=BRANCO
    )

    # — Extrator —
    ext_l = F1_L + Inches(0.15)
    ext_t = F1_T + Inches(2.85)
    ext_box = add_rect(slide, ext_l, ext_t, Inches(7.9), Inches(1.65),
                       fill=BRANCO, border=AZUL_MEDIO, border_w=Pt(1.2))
    add_label(slide, ext_l + Inches(0.1), ext_t + Inches(0.05), Inches(3), Inches(0.3),
              'Extrator (lib/excel/extractor.ts)',
              size=Pt(9), bold=True, color=AZUL_ESCURO, align=PP_ALIGN.LEFT)

    ext_items = [
        ('Dashboard', 'preço, margem,\ncusto, impostos, HH'),
        ('Tarefas', 'equipes,\nHH por função'),
        ('PDFs / DOCXs', 'escopo,\nmetodologia, textos'),
    ]
    for i, (titulo, desc) in enumerate(ext_items):
        el = ext_l + Inches(0.15 + i * 2.6)
        et = ext_t + Inches(0.42)
        ebox = add_rounded_rect(slide, el, et, Inches(2.35), Inches(1.1),
                                fill=AZUL_CLARO, border=AZUL_MEDIO, border_w=Pt(1),
                                text=f'{titulo}\n{desc}', font_size=Pt(9))

    # — DB —
    db_l = F1_L + Inches(2.8)
    db_t = F1_T + Inches(4.75)
    db_box = add_rounded_rect(slide, db_l, db_t, Inches(2.9), Inches(0.85),
                              fill=AZUL_MEDIO, border=AZUL_ESCURO, border_w=Pt(2),
                              text='🗄️  BaseConhecimento\n34 OS históricos',
                              font_size=Pt(11), bold=True, text_color=BRANCO)

    # Setas Fase 1
    # FUP → Script
    add_arrow(slide,
        F1_L + Inches(1.45), F1_T + Inches(1.35),
        F1_L + Inches(1.45), F1_T + Inches(1.78))
    # Pasta → Script (horizontal então desce)
    add_arrow(slide,
        pasta_l, F1_T + Inches(1.15),
        script_l + Inches(2.5), F1_T + Inches(2.1))
    # Script → Extrator
    add_arrow(slide,
        script_l + Inches(1.25), script_t + Inches(0.7),
        ext_l + Inches(3.95), ext_t)
    # Extrator → DB
    add_arrow(slide,
        ext_l + Inches(3.95), ext_t + Inches(1.65),
        db_l + Inches(1.45), db_t)

    # ════════════════════════════════════
    # FASE 2 — caixa verde (right 1/3)
    # ════════════════════════════════════
    F2_L = Inches(9.0)
    F2_T = Inches(1.1)
    F2_W = Inches(4.05)
    F2_H = Inches(5.9)

    fase2_box = add_rect(slide, F2_L, F2_T, F2_W, F2_H,
                         fill=VERDE_CLARO, border=VERDE_ESCURO, border_w=Pt(2))

    add_label(slide, F2_L + Inches(0.1), F2_T + Inches(0.05), Inches(3.8), Inches(0.35),
              '🔄  FASE 2 · Manutenção  (recorrente)',
              size=Pt(10), bold=True, color=VERDE_ESCURO, align=PP_ALIGN.LEFT)

    novo = add_rounded_rect(slide,
        F2_L + Inches(0.3), F2_T + Inches(0.55),
        Inches(3.45), Inches(0.85),
        fill=BRANCO, border=VERDE_ESCURO,
        text='✅  Novo OS concluído\n(pasta criada no servidor)',
        font_size=Pt(10)
    )

    re_script = add_rounded_rect(slide,
        F2_L + Inches(0.3), F2_T + Inches(1.85),
        Inches(3.45), Inches(0.85),
        fill=VERDE_ESCURO, border=VERDE_ESCURO,
        text='⚙️  import-historico.ts\n--os YYYY --skip-empty',
        font_size=Pt(10), bold=True, text_color=BRANCO
    )

    re_db = add_rounded_rect(slide,
        F2_L + Inches(0.3), F2_T + Inches(3.2),
        Inches(3.45), Inches(0.85),
        fill=VERDE_ESCURO, border=RGBColor(0x0A, 0x33, 0x1A), border_w=Pt(2),
        text='🗄️  BaseConhecimento\natualizado',
        font_size=Pt(11), bold=True, text_color=BRANCO
    )

    add_label(slide,
        F2_L + Inches(0.3), F2_T + Inches(4.25),
        Inches(3.45), Inches(1.4),
        'Cada vez que um novo OS\né finalizado, roda-se o\nimport para adicionar os\ndados ao histórico da IA.',
        size=Pt(10), color=VERDE_ESCURO, align=PP_ALIGN.LEFT
    )

    # Setas Fase 2
    add_arrow(slide,
        F2_L + Inches(2.0), F2_T + Inches(1.4),
        F2_L + Inches(2.0), F2_T + Inches(1.83),
        color=VERDE_ESCURO)
    add_arrow(slide,
        F2_L + Inches(2.0), F2_T + Inches(2.7),
        F2_L + Inches(2.0), F2_T + Inches(3.18),
        color=VERDE_ESCURO)

    # ── Rodapé ──────────────────────────────────────────────────────────────
    add_label(slide,
        Inches(0.3), Inches(7.15), Inches(12.7), Inches(0.28),
        'Sistema Modelo  ·  Gestão de Propostas com IA  ·  Gerupa Engenharia',
        size=Pt(9), color=RGBColor(0x99, 0x99, 0x99), align=PP_ALIGN.CENTER
    )


# ════════════════════════════════════════════════════════════════════════════
# SLIDE 2 — Geração de Proposta com IA
# ════════════════════════════════════════════════════════════════════════════
def slide2(prs):
    layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(layout)

    bg = slide.background
    bg.fill.solid()
    bg.fill.fore_color.rgb = BRANCO

    # ── Título ──────────────────────────────────────────────────────────────
    add_label(slide,
        Inches(0.3), Inches(0.15), Inches(12.7), Inches(0.55),
        'Geração de Proposta com IA',
        size=Pt(24), bold=True, color=AZUL_ESCURO, align=PP_ALIGN.LEFT
    )
    add_label(slide,
        Inches(0.3), Inches(0.65), Inches(12.7), Inches(0.3),
        'O que acontece a cada nova proposta gerada pelo usuário',
        size=Pt(13), color=RGBColor(0x55, 0x55, 0x55), align=PP_ALIGN.LEFT
    )
    add_rect(slide, Inches(0.3), Inches(0.95), Inches(12.73), Inches(0.03),
             fill=AZUL_MEDIO, border=AZUL_MEDIO)

    # ── Layout: 3 colunas (Entradas | IA | Saídas) ─────────────────────────
    COL_T = Inches(1.15)
    COL_H = Inches(5.85)

    # Entradas
    ENT_L = Inches(0.25)
    ENT_W = Inches(3.8)
    add_rect(slide, ENT_L, COL_T, ENT_W, COL_H,
             fill=AZUL_CLARO, border=AZUL_MEDIO, border_w=Pt(2))
    add_label(slide, ENT_L + Inches(0.1), COL_T + Inches(0.07), ENT_W, Inches(0.3),
              'ENTRADAS', size=Pt(11), bold=True, color=AZUL_MEDIO, align=PP_ALIGN.LEFT)

    entradas = [
        ('📄', 'Edital / Escopo', 'Upload do usuário\n(PDF ou DOCX)'),
        ('🗄️', 'Histórico de OS', '30 projetos similares\nextraídos do banco'),
        ('📋', 'Regras do Molde', 'System prompt fixo\ncom critérios e formato'),
    ]
    for i, (icon, titulo, desc) in enumerate(entradas):
        et = COL_T + Inches(0.55 + i * 1.68)
        ebox = add_rounded_rect(slide,
            ENT_L + Inches(0.2), et, ENT_W - Inches(0.4), Inches(1.45),
            fill=BRANCO, border=AZUL_MEDIO, border_w=Pt(1.2),
            text=f'{icon}  {titulo}\n\n{desc}', font_size=Pt(10)
        )

    # IA
    IA_L = Inches(4.55)
    IA_W = Inches(4.2)
    add_rect(slide, IA_L, COL_T, IA_W, COL_H,
             fill=RGBColor(0xFE, 0xF9, 0xEC), border=LARANJA, border_w=Pt(2))
    add_label(slide, IA_L + Inches(0.1), COL_T + Inches(0.07), IA_W, Inches(0.3),
              'MOTOR DE IA', size=Pt(11), bold=True, color=LARANJA, align=PP_ALIGN.LEFT)

    ia_etapas = [
        ('🔍', 'Busca Semântica', 'Compara o escopo do edital\ncom os OS históricos\ne seleciona os mais similares'),
        ('🤖', 'Claude API', 'Gera a resposta usando\no contexto histórico\ne as regras do molde'),
    ]
    for i, (icon, titulo, desc) in enumerate(ia_etapas):
        et = COL_T + Inches(0.6 + i * 2.55)
        add_rounded_rect(slide,
            IA_L + Inches(0.25), et, IA_W - Inches(0.5), Inches(2.1),
            fill=BRANCO, border=LARANJA, border_w=Pt(1.2),
            text=f'{icon}  {titulo}\n\n{desc}', font_size=Pt(10)
        )
        if i == 0:
            add_arrow(slide,
                IA_L + Inches(2.1), et + Inches(2.1),
                IA_L + Inches(2.1), et + Inches(2.53),
                color=LARANJA)

    # Saídas
    SAI_L = Inches(9.25)
    SAI_W = Inches(3.8)
    add_rect(slide, SAI_L, COL_T, SAI_W, COL_H,
             fill=VERDE_CLARO, border=VERDE_ESCURO, border_w=Pt(2))
    add_label(slide, SAI_L + Inches(0.1), COL_T + Inches(0.07), SAI_W, Inches(0.3),
              'SAÍDAS', size=Pt(11), bold=True, color=VERDE_ESCURO, align=PP_ALIGN.LEFT)

    saidas = [
        ('💬', 'Chat Interativo', 'Respostas em linguagem\nnatural sobre o projeto'),
        ('📊', 'Painel de Orçamento', 'Preço, margem, equipes\ne custo estimado'),
        ('ℹ️', 'OS de Referência', 'Modal com detalhes dos\nprojetos similares usados'),
    ]
    for i, (icon, titulo, desc) in enumerate(saidas):
        et = COL_T + Inches(0.55 + i * 1.68)
        add_rounded_rect(slide,
            SAI_L + Inches(0.2), et, SAI_W - Inches(0.4), Inches(1.45),
            fill=BRANCO, border=VERDE_ESCURO, border_w=Pt(1.2),
            text=f'{icon}  {titulo}\n\n{desc}', font_size=Pt(10)
        )

    # ── Setas entre colunas ─────────────────────────────────────────────────
    # Entradas → IA
    mid_ent_y = COL_T + COL_H / 2
    add_arrow(slide,
        ENT_L + ENT_W, mid_ent_y,
        IA_L, mid_ent_y,
        color=AZUL_MEDIO, width=Pt(2.5))
    add_label(slide, ENT_L + ENT_W + Inches(0.05), mid_ent_y - Inches(0.28),
              Inches(0.45), Inches(0.3), '', size=Pt(9))

    # IA → Saídas
    add_arrow(slide,
        IA_L + IA_W, mid_ent_y,
        SAI_L, mid_ent_y,
        color=LARANJA, width=Pt(2.5))

    # ── Rodapé ──────────────────────────────────────────────────────────────
    add_label(slide,
        Inches(0.3), Inches(7.15), Inches(12.7), Inches(0.28),
        'Sistema Modelo  ·  Gestão de Propostas com IA  ·  Gerupa Engenharia',
        size=Pt(9), color=RGBColor(0x99, 0x99, 0x99), align=PP_ALIGN.CENTER
    )


# ════════════════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    prs = prs_new()
    slide1(prs)
    slide2(prs)
    out = '/tmp/Modelo-Apresentacao.pptx'
    prs.save(out)
    print(f'Salvo em: {out}')
