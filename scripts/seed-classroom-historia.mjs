/**
 * Seed: Sala completa de História para Roberto Carlos Ferreira.
 * Cria: 5 alunos fake, 1 sala, 4 atividades, 3 materiais, matrículas e submissões.
 * Uso: node scripts/seed-classroom-historia.mjs
 */
import pg from "pg"
import bcrypt from "bcryptjs"
import { randomUUID } from "crypto"

const { Pool } = pg

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://app_user:app_password@localhost:5432/appdb",
  ssl: false,
})

const STUDENT_HASH = await bcrypt.hash("Aluno@123", 12)

// ─── Alunos fake ──────────────────────────────────────────────────────────────

const FAKE_STUDENTS = [
  {
    fullName: "Lucas Almeida Costa",
    email: "lucas.costa.aluno@outlook.com",
    bio: "Estudante do 3º ano do Ensino Médio, apaixonado por história e política.",
    interests: ["História", "Geopolítica", "Literatura"],
  },
  {
    fullName: "Isabela Torres Mendes",
    email: "isabela.torres.estudante@gmail.com",
    bio: "Cursando pré-vestibular, foco em Ciências Humanas para tentar medicina social.",
    interests: ["História", "Sociologia", "Filosofia"],
  },
  {
    fullName: "Gabriel Nascimento Souza",
    email: "gabriel.nascimento@hotmail.com",
    bio: "2º ano do Ensino Médio, jogador de xadrez e entusiasta de história mundial.",
    interests: ["História Mundial", "Estratégia", "Matemática"],
  },
  {
    fullName: "Mariana Rocha Lima",
    email: "mariana.rocha.lima@yahoo.com.br",
    bio: "Estudante dedicada, participante de olimpíadas de história e ciências sociais.",
    interests: ["História do Brasil", "Antropologia", "Artes"],
  },
  {
    fullName: "Felipe Andrade Santos",
    email: "felipe.andrade.edu@gmail.com",
    bio: "Interessado em História Contemporânea e relações internacionais. Quer cursar RI.",
    interests: ["Geopolítica", "Direito Internacional", "História"],
  },
]

// ─── Sala ─────────────────────────────────────────────────────────────────────

const CLASSROOM = {
  name: "História Contemporânea — 3º Ano",
  subject: "História",
  education_level: "Ensino Médio",
  description:
    "Turma voltada ao aprofundamento da História Contemporânea e do Brasil Republicano, com foco no ENEM e nos principais vestibulares. Trabalhamos análise crítica de fontes, questões históricas e redação dissertativa. Bem-vindos!",
  invite_code: "HIST2025",
  max_students: 40,
  status: "ativa",
}

// ─── Atividades ───────────────────────────────────────────────────────────────

function qid() {
  return randomUUID()
}

// 1. Trabalho (dissertativo, sem questões estruturadas)
const TRABALHO = {
  type: "trabalho",
  title: "Trabalho: Causas e Consequências da Primeira Guerra Mundial",
  description: `<h2>Objetivo</h2>
<p>Elaborar um trabalho dissertativo analisando as causas estruturais e os desdobramentos da Primeira Guerra Mundial, com ênfase no impacto para a reorganização do mundo moderno.</p>
<h2>Roteiro</h2>
<ul>
  <li>Introdução: contextualização do período (1871–1914)</li>
  <li>Causas estruturais: militarismo, alianças, imperialismo, nacionalismo (modelo MAIN)</li>
  <li>O estopim: o assassinato de Francisco Fernando e o mecanismo das alianças</li>
  <li>Principais frentes e inovações bélicas</li>
  <li>O Tratado de Versalhes e seus desdobramentos</li>
  <li>Conclusão: conexão com a Segunda Guerra Mundial e o mundo atual</li>
</ul>
<h2>Requisitos</h2>
<p>Mínimo 4 páginas (1.500 palavras). Utilize pelo menos 3 fontes (livros, artigos ou documentários indicados no material da sala). Entregue em PDF via a plataforma.</p>`,
  starts_at: new Date(Date.now() - 7 * 86400000).toISOString(),
  due_at: new Date(Date.now() + 14 * 86400000).toISOString(),
  max_score: 10,
  status: "aberta",
  settings: {
    attachments: [],
    exam: null,
  },
}

// 2. Prova objetiva (MCQ com questões reais de vestibular)
const Q_PROVA = [
  {
    id: qid(), order: 1, type: "mcq", points: 2,
    prompt: "(ENEM 2019) O sistema de alianças que vigorou na Europa entre os séculos XIX e XX foi responsável pela escalada do conflito que ficou conhecido como Primeira Guerra Mundial. Esse sistema tinha como característica principal:",
    options: [
      "A manutenção de relações diplomáticas exclusivamente bilaterais entre potências.",
      "A garantia de apoio mútuo em caso de conflito, transformando disputas locais em guerras generalizadas.",
      "A criação de uma autoridade supranacional capaz de arbitrar disputas territoriais.",
      "O controle da corrida armamentista por meio de tratados de limitação de armas.",
      "A neutralidade obrigatória de todas as nações signatárias diante de conflitos regionais.",
    ],
    correctIndex: 1,
  },
  {
    id: qid(), order: 2, type: "mcq", points: 2,
    prompt: "(FUVEST) O Tratado de Versalhes (1919), ao impor condições humilhantes à Alemanha, contribuiu diretamente para o surgimento do nazismo porque:",
    options: [
      "Proibiu a Alemanha de ter qualquer tipo de indústria.",
      "Exigiu a devolução de territórios à França, que passaram a ser governados por populações hostis.",
      "Gerou profunda crise econômica e ressentimento nacional, criando terreno fértil para discursos ultranacionalistas.",
      "Determinou a divisão da Alemanha em quatro zonas de ocupação controladas pelos Aliados.",
      "Estabeleceu sanções que impediram a Alemanha de participar de qualquer organização internacional.",
    ],
    correctIndex: 2,
  },
  {
    id: qid(), order: 3, type: "mcq", points: 2,
    prompt: "(UNICAMP) A Era Vargas (1930–1954) caracterizou-se por um projeto de modernização conservadora do Brasil. Assinale a alternativa que melhor define o conceito de 'populismo' aplicado a esse período:",
    options: [
      "Governo exclusivamente baseado na vontade popular expressa em eleições livres e regulares.",
      "Aliança entre massas urbanas e líderes carismáticos que mobilizam o povo de forma manipulada, sem alterar estruturas de poder.",
      "Movimento de reforma agrária radical que redistribuiu terras aos trabalhadores rurais.",
      "Política econômica de abertura ao capital estrangeiro como estratégia de desenvolvimento.",
      "Doutrina política que defende a primazia dos interesses nacionais sobre os internacionais.",
    ],
    correctIndex: 1,
  },
  {
    id: qid(), order: 4, type: "mcq", points: 2,
    prompt: "(ENEM 2022) A Revolução Industrial britânica do século XVIII produziu mudanças profundas nas relações de trabalho. A formação do proletariado industrial implicou:",
    options: [
      "A manutenção das estruturas feudais de servidão, agora aplicadas às fábricas.",
      "A redução da jornada de trabalho e a melhoria das condições de vida da classe trabalhadora.",
      "A separação do trabalhador dos meios de produção e a venda da força de trabalho como mercadoria.",
      "O fortalecimento das corporações de ofício medievais adaptadas ao contexto industrial.",
      "A eliminação imediata do trabalho infantil por pressão dos sindicatos emergentes.",
    ],
    correctIndex: 2,
  },
  {
    id: qid(), order: 5, type: "mcq", points: 2,
    prompt: "(PUC-SP) A instalação do regime militar no Brasil em 1964 contou com apoio de diferentes setores da sociedade. Entre os argumentos utilizados para justificar o golpe, destaca-se:",
    options: [
      "A necessidade de acelerar as reformas de base propostas por João Goulart.",
      "O risco de uma 'cubanização' do Brasil diante das reformas sociais propostas pelo presidente.",
      "A crise fiscal provocada pelo aumento do salário mínimo decretado por Goulart.",
      "O pedido das Forças Armadas por maiores recursos para modernização tecnológica.",
      "A pressão dos partidos de esquerda por uma nova Constituição mais democrática.",
    ],
    correctIndex: 1,
  },
]

const PROVA_OBJETIVA = {
  type: "prova_objetiva",
  title: "1ª Avaliação: Do Imperialismo ao Estado Novo",
  description: `<p>Prova objetiva com 5 questões de múltipla escolha, abrangendo os conteúdos estudados nas primeiras unidades: Imperialismo, Primeira Guerra Mundial, Revolução Industrial e Era Vargas.</p>
<p><strong>Regras:</strong> cada questão vale 2,0 pontos (total 10,0). Sem consulta. Responda com atenção — sem possibilidade de alteração após o envio.</p>`,
  starts_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  due_at: new Date(Date.now() + 5 * 86400000).toISOString(),
  max_score: 10,
  status: "aberta",
  settings: {
    exam: {
      version: 1,
      questions: Q_PROVA,
    },
    attachments: [],
  },
}

// 3. Lista de exercícios (MCQ + questões abertas)
const Q_LISTA_MCQ = [
  {
    id: qid(), order: 1, type: "mcq", points: 1,
    prompt: "O conceito de 'imperialismo' no final do século XIX refere-se principalmente:",
    options: [
      "À expansão militar defensiva das potências europeias para proteger suas fronteiras.",
      "À dominação econômica, política e cultural de povos de outros continentes por nações industrializadas.",
      "À criação de impérios multiétnicos baseados em laços culturais e religiosos comuns.",
      "À política de isolacionismo adotada pelas grandes potências após guerras napoleônicas.",
    ],
    correctIndex: 1,
  },
  {
    id: qid(), order: 2, type: "mcq", points: 1,
    prompt: "A Conferência de Berlim (1884-85) foi convocada com a finalidade de:",
    options: [
      "Criar um acordo de paz após a guerra franco-prussiana.",
      "Regulamentar a partilha da África entre as potências europeias.",
      "Estabelecer as fronteiras dos impérios otomano e austro-húngaro.",
      "Definir as rotas comerciais marítimas no Atlântico Sul.",
    ],
    correctIndex: 1,
  },
  {
    id: qid(), order: 3, type: "mcq", points: 1,
    prompt: "A política do 'café com leite' na República Velha (1889-1930) consistia em:",
    options: [
      "Uma política econômica de exportação conjunta de café e produtos derivados do leite.",
      "A alternância no poder presidencial entre elites de São Paulo (café) e Minas Gerais (pecuária leiteira).",
      "Um acordo comercial entre Brasil e Argentina para exportação conjunta de commodities.",
      "A aliança entre fazendeiros e comerciantes urbanos para controlar o câmbio.",
    ],
    correctIndex: 1,
  },
]

const Q_LISTA_OPEN = [
  {
    id: qid(), order: 4, type: "open", points: 3,
    prompt: "Explique o conceito de 'nacionalismo' no contexto europeu do século XIX e início do XX. Como ele contribuiu para a eclosão da Primeira Guerra Mundial? Cite pelo menos dois exemplos concretos em sua resposta.",
  },
  {
    id: qid(), order: 5, type: "open", points: 4,
    prompt: "Analise o legado da Era Vargas para a classe trabalhadora brasileira. A CLT (Consolidação das Leis do Trabalho) representou uma conquista genuína dos trabalhadores ou foi uma estratégia de controle do governo? Argumente com base em fatos históricos.",
  },
]

const LISTA_EXERCICIOS = {
  type: "lista_exercicios",
  title: "Lista 01: Imperialismo, República Velha e Era Vargas",
  description: `<p>Esta lista combina questões de múltipla escolha (3 questões × 1 ponto) e questões dissertativas (2 questões abertas). Total: 10 pontos.</p>
<p><strong>Dica:</strong> nas questões abertas, utilize os textos complementares disponíveis nos Materiais da sala. Resposta mínima esperada: 8–10 linhas por questão aberta.</p>`,
  starts_at: new Date(Date.now() - 10 * 86400000).toISOString(),
  due_at: new Date(Date.now() + 3 * 86400000).toISOString(),
  max_score: 10,
  status: "aberta",
  settings: {
    exam: {
      version: 1,
      questions: [...Q_LISTA_MCQ, ...Q_LISTA_OPEN],
    },
    attachments: [],
  },
}

// 4. Atividade encerrada com correção (para testar o histórico)
const Q_ENCERRADA = [
  {
    id: qid(), order: 1, type: "mcq", points: 2,
    prompt: "O processo de independência do Brasil em 1822 se distingue das independências hispano-americanas principalmente porque:",
    options: [
      "Foi conduzido por movimentos populares de base que expulsaram os colonizadores.",
      "Resultou de uma revolução armada liderada por militares criollos contra Portugal.",
      "Ocorreu por um processo relativamente pacífico, conduzido pela própria família real portuguesa transferida ao Brasil.",
      "Foi resultado direto da pressão militar britânica sobre Portugal para liberar a colônia.",
      "Decorreu de uma insurreição indígena que forçou a negociação com a metrópole.",
    ],
    correctIndex: 2,
  },
  {
    id: qid(), order: 2, type: "mcq", points: 2,
    prompt: "A Proclamação da República no Brasil (1889) é compreendida pelos historiadores como uma 'revolução de cima para baixo' principalmente porque:",
    options: [
      "Contou com ampla participação popular e mobilização das classes trabalhadoras urbanas.",
      "Foi resultado de pressão internacional, especialmente dos Estados Unidos da América.",
      "Envolveu apenas militares e elites agrárias, sem participação significativa do povo.",
      "Decorreu de um plebiscito nacional que aprovou o fim da monarquia.",
      "Resultou de décadas de resistência quilombola e camponesa contra o Império.",
    ],
    correctIndex: 2,
  },
  {
    id: qid(), order: 3, type: "mcq", points: 2,
    prompt: "A abolição da escravidão no Brasil (Lei Áurea, 1888) é considerada incompleta pelos historiadores porque:",
    options: [
      "Não foi reconhecida internacionalmente pelos países que ainda mantinham o tráfico.",
      "Liberou os escravizados sem qualquer política de integração, terras ou reparação, perpetuando a exclusão.",
      "A lei foi revogada parcialmente dois anos depois por pressão dos fazendeiros.",
      "Apenas os escravizados adultos foram libertados; crianças permaneceram sob tutela dos senhores.",
      "A medida foi restrita ao sul do país e não se aplicou às províncias do norte.",
    ],
    correctIndex: 1,
  },
  {
    id: qid(), order: 4, type: "open", points: 4,
    prompt: "Discuta o papel da Questão Militar na crise do Império brasileiro e na Proclamação da República de 1889. Que interesses os militares representavam e por que se opuseram ao regime monárquico?",
  },
]

const ATIVIDADE_ENCERRADA = {
  type: "prova_objetiva",
  title: "Avaliação Diagnóstica: Brasil Imperial e Proclamação da República",
  description: `<p>Avaliação diagnóstica aplicada no início do módulo para medir o conhecimento prévio dos alunos sobre o período imperial e a transição para a República.</p>
<p><strong>Status: Encerrada.</strong> Consulte sua nota e o gabarito nos resultados.</p>`,
  starts_at: new Date(Date.now() - 21 * 86400000).toISOString(),
  due_at: new Date(Date.now() - 7 * 86400000).toISOString(),
  max_score: 10,
  status: "encerrada",
  settings: {
    exam: {
      version: 1,
      questions: Q_ENCERRADA,
    },
    attachments: [],
  },
}

// ─── Materiais ────────────────────────────────────────────────────────────────

const MATERIAIS = [
  {
    title: "Roteiro de Estudo: Primeira Guerra Mundial",
    description:
      "Material de apoio com linha do tempo, mapa das alianças e resumo dos principais tratados. Indicado para a 1ª Avaliação e o Trabalho.",
    external_url: "https://www.historiadomundo.com.br/idade-contemporanea/primeira-guerra-mundial",
    status: "publicado",
    settings: { attachments: [] },
  },
  {
    title: "Documentário: Era Vargas — CPDOC/FGV",
    description:
      "Série documental produzida pelo Centro de Pesquisa e Documentação de História Contemporânea do Brasil. Essencial para entender o getulismo e a CLT.",
    external_url: "https://cpdoc.fgv.br/producao/dossies/AEraVargas1",
    status: "publicado",
    settings: { attachments: [] },
  },
  {
    title: "Atlas Histórico Digital — IBGE",
    description:
      "Mapas interativos sobre a formação territorial do Brasil, distribuição de escravizados e evolução das fronteiras. Excelente recurso visual.",
    external_url: "https://atlasescolar.ibge.gov.br",
    status: "publicado",
    settings: { attachments: [] },
  },
]

// ─── Funções ──────────────────────────────────────────────────────────────────

async function upsertStudent(client, student) {
  const userId = randomUUID()
  await client.query(
    `INSERT INTO public.users (id, email, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (email) DO NOTHING`,
    [userId, student.email, STUDENT_HASH]
  )
  const { rows } = await client.query(
    `SELECT id FROM public.users WHERE email = $1`, [student.email]
  )
  const finalId = rows[0]?.id
  if (!finalId) throw new Error(`Usuário não encontrado: ${student.email}`)

  await client.query(
    `INSERT INTO public.profiles (id, full_name, user_type, bio, interests, created_at, updated_at)
     VALUES ($1, $2, 'aluno', $3, $4, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, bio = EXCLUDED.bio`,
    [finalId, student.fullName, student.bio, student.interests]
  )
  return finalId
}

async function getProfessorId(client) {
  const { rows } = await client.query(
    `SELECT p.id FROM public.profiles p
     JOIN public.users u ON u.id = p.id
     WHERE u.email = 'roberto.ferreira@historiabrasil.net'`
  )
  if (!rows[0]) throw new Error("Professor Roberto não encontrado. Execute seed-professors.mjs primeiro.")
  return rows[0].id
}

async function createClassroom(client, professorId) {
  const { rows } = await client.query(
    `INSERT INTO public.classrooms
       (professor_id, name, subject, education_level, description, invite_code, max_students, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (invite_code) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description
     RETURNING id`,
    [
      professorId,
      CLASSROOM.name,
      CLASSROOM.subject,
      CLASSROOM.education_level,
      CLASSROOM.description,
      CLASSROOM.invite_code,
      CLASSROOM.max_students,
      CLASSROOM.status,
    ]
  )
  return rows[0].id
}

async function createActivity(client, classroomId, activity) {
  const { rows } = await client.query(
    `INSERT INTO public.classroom_activities
       (classroom_id, type, title, description, starts_at, due_at, max_score, status, settings)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING id`,
    [
      classroomId,
      activity.type,
      activity.title,
      activity.description,
      activity.starts_at,
      activity.due_at,
      activity.max_score,
      activity.status,
      JSON.stringify(activity.settings),
    ]
  )
  return rows[0].id
}

async function createMaterial(client, classroomId, material) {
  await client.query(
    `INSERT INTO public.classroom_materials
       (classroom_id, title, description, external_url, status, settings)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      classroomId,
      material.title,
      material.description,
      material.external_url,
      material.status,
      JSON.stringify(material.settings),
    ]
  )
}

async function enrollStudent(client, classroomId, studentId) {
  await client.query(
    `INSERT INTO public.classroom_members (classroom_id, student_id)
     VALUES ($1, $2)
     ON CONFLICT (classroom_id, student_id) DO NOTHING`,
    [classroomId, studentId]
  )
}

// Cria submissão da atividade encerrada (para simular alunos que já responderam)
async function createSubmission(client, activityId, studentId, exam, scoreOverride) {
  if (!exam) return
  const answers = {}
  let mcqScore = 0

  for (const q of exam.questions) {
    if (q.type === "mcq") {
      // resposta certa ou errada dependendo do aluno
      const choose = scoreOverride >= 6 ? q.correctIndex : (q.correctIndex + 1) % q.options.length
      answers[q.id] = { type: "mcq", choiceIndex: choose }
      if (choose === q.correctIndex) mcqScore += q.points
    } else {
      answers[q.id] = {
        type: "open",
        text: `Resposta dissertativa elaborada pelo aluno. ${scoreOverride >= 7
          ? "A resposta demonstra compreensão aprofundada do tema, com argumentos sólidos e exemplos pertinentes do período histórico estudado. O estudante relacionou corretamente os conceitos de nacionalismo e imperialismo com os eventos que precipitaram o conflito."
          : "A resposta aborda o tema de forma superficial, sem aprofundar os conceitos fundamentais. Apresenta alguns fatos corretos, mas falta coerência na argumentação histórica."
        }`,
      }
    }
  }

  // Open scores proporcionais à nota desejada
  const openScores = {}
  for (const q of exam.questions) {
    if (q.type === "open") {
      openScores[q.id] = scoreOverride >= 7 ? q.points : Math.floor(q.points * 0.5)
    }
  }

  const totalOpen = Object.values(openScores).reduce((s, v) => s + v, 0)
  const scoreTotal = mcqScore + totalOpen

  await client.query(
    `INSERT INTO public.classroom_activity_submissions
       (activity_id, student_id, status, answers, score_mcq, open_scores, score_total, submitted_at)
     VALUES ($1, $2, 'enviado', $3::jsonb, $4, $5::jsonb, $6, NOW() - INTERVAL '${Math.floor(Math.random() * 6) + 1} days')
     ON CONFLICT (activity_id, student_id) DO NOTHING`,
    [
      activityId,
      studentId,
      JSON.stringify(answers),
      mcqScore,
      JSON.stringify(openScores),
      scoreTotal,
    ]
  )
  return scoreTotal
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const client = await pool.connect()
try {
  await client.query("BEGIN")

  // 1. Professor
  process.stdout.write("Buscando professor Roberto Ferreira... ")
  const professorId = await getProfessorId(client)
  console.log(`✓ id=${professorId}`)

  // 2. Alunos fake
  console.log("\nCriando alunos:")
  const fakeStudentIds = []
  for (const s of FAKE_STUDENTS) {
    process.stdout.write(`  ${s.fullName}... `)
    const id = await upsertStudent(client, s)
    fakeStudentIds.push(id)
    console.log("✓")
  }

  // 3. Buscar alunos existentes (Warley etc.)
  const { rows: existingStudents } = await client.query(
    `SELECT p.id FROM public.profiles p WHERE p.user_type = 'aluno'`
  )
  const allStudentIds = [...new Set([
    ...existingStudents.map((r) => r.id),
    ...fakeStudentIds,
  ])]

  // 4. Criar sala
  process.stdout.write("\nCriando sala de aula... ")
  const classroomId = await createClassroom(client, professorId)
  console.log(`✓ id=${classroomId}`)
  console.log(`  Código de convite: ${CLASSROOM.invite_code}`)

  // 5. Atividades
  console.log("\nCriando atividades:")

  process.stdout.write("  Trabalho dissertativo... ")
  await createActivity(client, classroomId, TRABALHO)
  console.log("✓")

  process.stdout.write("  1ª Avaliação (prova objetiva)... ")
  const provaId = await createActivity(client, classroomId, PROVA_OBJETIVA)
  console.log("✓")

  process.stdout.write("  Lista de exercícios 01... ")
  const listaId = await createActivity(client, classroomId, LISTA_EXERCICIOS)
  console.log("✓")

  process.stdout.write("  Avaliação diagnóstica (encerrada)... ")
  const diagId = await createActivity(client, classroomId, ATIVIDADE_ENCERRADA)
  console.log("✓")

  // 6. Materiais
  console.log("\nCriando materiais:")
  for (const m of MATERIAIS) {
    process.stdout.write(`  ${m.title.slice(0, 45)}... `)
    await createMaterial(client, classroomId, m)
    console.log("✓")
  }

  // 7. Matricular todos os alunos
  console.log("\nMatriculando alunos:")
  for (const sid of allStudentIds) {
    await enrollStudent(client, classroomId, sid)
  }
  console.log(`  ✓ ${allStudentIds.length} alunos matriculados`)

  // 8. Submissões na avaliação diagnóstica (encerrada)
  console.log("\nCriando submissões na avaliação diagnóstica:")
  const diagExam = ATIVIDADE_ENCERRADA.settings.exam
  const scores = [9, 7, 5, 8, 6, 9, 7]
  for (let i = 0; i < Math.min(allStudentIds.length, scores.length); i++) {
    const sid = allStudentIds[i]
    const nota = scores[i]
    process.stdout.write(`  Aluno ${i + 1} (nota alvo ~${nota})... `)
    const real = await createSubmission(client, diagId, sid, diagExam, nota)
    console.log(`✓ nota=${real}`)
  }

  // 9. Algumas submissões em rascunho na prova aberta (alunos iniciaram mas não enviaram)
  const provaExam = PROVA_OBJETIVA.settings.exam
  for (let i = 0; i < 3; i++) {
    const sid = allStudentIds[i]
    const partialAnswers = {}
    // só respondeu 2 das 5 questões
    for (let j = 0; j < 2; j++) {
      const q = provaExam.questions[j]
      partialAnswers[q.id] = { type: "mcq", choiceIndex: q.correctIndex }
    }
    await client.query(
      `INSERT INTO public.classroom_activity_submissions
         (activity_id, student_id, status, answers, score_mcq, open_scores, score_total)
       VALUES ($1, $2, 'rascunho', $3::jsonb, 0, '{}'::jsonb, NULL)
       ON CONFLICT (activity_id, student_id) DO NOTHING`,
      [provaId, sid, JSON.stringify(partialAnswers)]
    )
  }
  console.log("\n  3 alunos com rascunho em andamento na 1ª Avaliação")

  await client.query("COMMIT")

  console.log("\n" + "═".repeat(60))
  console.log("✅ SEED CONCLUÍDO COM SUCESSO!")
  console.log("═".repeat(60))
  console.log(`\n📚 Sala:        "${CLASSROOM.name}"`)
  console.log(`🔑 Código:      ${CLASSROOM.invite_code}`)
  console.log(`👨‍🏫 Professor:   Roberto Carlos Ferreira`)
  console.log(`👥 Alunos:      ${allStudentIds.length} matriculados`)
  console.log(`\n📝 Atividades:`)
  console.log(`   • Trabalho dissertativo                  [ABERTA, prazo: +14d]`)
  console.log(`   • 1ª Avaliação (prova objetiva, 5 MCQ)   [ABERTA, prazo: +5d]`)
  console.log(`   • Lista 01 (3 MCQ + 2 abertas)           [ABERTA, prazo: +3d]`)
  console.log(`   • Avaliação diagnóstica                  [ENCERRADA]`)
  console.log(`\n📄 Materiais:   3 links publicados`)
  console.log(`\n🔐 Senha dos alunos fake: Aluno@123`)
  console.log(`\nAlunos fake criados:`)
  FAKE_STUDENTS.forEach((s) => console.log(`   ${s.fullName.padEnd(30)} ${s.email}`))
} catch (err) {
  await client.query("ROLLBACK")
  console.error("\n❌ Erro:", err.message)
  throw err
} finally {
  client.release()
  await pool.end()
}
