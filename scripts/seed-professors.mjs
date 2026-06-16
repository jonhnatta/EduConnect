/**
 * Seed: 10 professores falsos com perfis completos e 5-6 postagens cada.
 * Uso: node scripts/seed-professors.mjs
 */
import pg from "pg"
import bcrypt from "bcryptjs"
import { randomUUID } from "crypto"

const { Pool } = pg

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://app_user:app_password@localhost:5432/appdb",
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
})

const PASSWORD_HASH = await bcrypt.hash("Professor@123", 12)

// ─── Dados dos professores ────────────────────────────────────────────────────

const professors = [
  {
    fullName: "Carlos Eduardo Mendonça",
    email: "carlos.mendonca@matematicaviva.com.br",
    area: "Matemática",
    bio: "Professor de Matemática com 12 anos de experiência no Ensino Médio e cursinho pré-vestibular. Especialista em Álgebra, Geometria e Matemática Financeira. Acredito que qualquer pessoa pode dominar a matemática com a abordagem certa.",
    interests: ["Álgebra", "Geometria", "Cálculo", "Vestibular"],
  },
  {
    fullName: "Ana Beatriz Santos Pereira",
    email: "anabeatriz.santos@fisicaeducacional.com.br",
    area: "Física",
    bio: "Mestre em Física pela USP, professora há 9 anos. Apaixonada por tornar a Física acessível e intuitiva. Desenvolvo experimentos simples que podem ser feitos em casa para ilustrar os fenômenos físicos.",
    interests: ["Mecânica", "Eletromagnetismo", "Termodinâmica", "Física Moderna"],
  },
  {
    fullName: "Roberto Carlos Ferreira",
    email: "roberto.ferreira@historiabrasil.net",
    area: "História",
    bio: "Historiador e professor com 15 anos de atuação. Doutor em História do Brasil pela UNICAMP. Especializado em História Contemporânea e ensino crítico das fontes históricas.",
    interests: ["História do Brasil", "História Mundial", "Historiografia", "Cultura"],
  },
  {
    fullName: "Fernanda Lima Carvalho",
    email: "fernanda.lima@biociencias.edu.br",
    area: "Biologia",
    bio: "Bióloga e professora com pós-graduação em Genética. Trabalho com educação há 10 anos, focada em trazer a biologia molecular e a ecologia para a realidade dos alunos. Defendo o ensino baseado em evidências.",
    interests: ["Genética", "Ecologia", "Fisiologia", "Evolução"],
  },
  {
    fullName: "Marcos Vinícius Oliveira",
    email: "marcos.oliveira@linguaportuguesa.org",
    area: "Língua Portuguesa",
    bio: "Mestre em Letras pela PUC-Rio. Professor de Português e Literatura há 11 anos. Especialista em redação para o ENEM e análise literária. Ajudo alunos a desenvolverem seu próprio estilo de escrita.",
    interests: ["Gramática", "Redação ENEM", "Literatura Brasileira", "Interpretação de Texto"],
  },
  {
    fullName: "Juliana Costa Rodrigues",
    email: "juliana.costa@quimicanapratica.com.br",
    area: "Química",
    bio: "Química industrial reconvertida à docência. 8 anos de experiência em sala de aula, com foco em conectar a teoria química com aplicações do dia a dia e processos industriais. Especialista em Química Orgânica.",
    interests: ["Química Orgânica", "Termoquímica", "Eletroquímica", "Química Ambiental"],
  },
  {
    fullName: "Pedro Henrique Alves",
    email: "pedro.alves@geografiadigital.com.br",
    area: "Geografia",
    bio: "Geógrafo e educador com 13 anos de experiência. Especializado em Geopolítica e Cartografia Digital. Utilizo tecnologias de geoprocessamento e mapas interativos para enriquecer as aulas.",
    interests: ["Geopolítica", "Cartografia", "Clima", "Urbanização"],
  },
  {
    fullName: "Camila Rocha Brandão",
    email: "camila.rocha@filosofianaescola.com.br",
    area: "Filosofia",
    bio: "Doutoranda em Filosofia pela UFMG. Professora de Filosofia e Sociologia há 7 anos. Acredito que a Filosofia deve ser prática e transformadora. Trabalho com metodologias ativas para desenvolver o pensamento crítico.",
    interests: ["Ética", "Filosofia Política", "Epistemologia", "Existencialismo"],
  },
  {
    fullName: "Rafael Augusto Souza",
    email: "rafael.souza@englishcoach.com.br",
    area: "Inglês",
    bio: "Professor certificado CELTA com 10 anos de experiência no ensino de inglês. Formado em Letras-Inglês pela UFRJ, com especialização em Linguística Aplicada. Metodologia comunicativa com foco em fluência real.",
    interests: ["Grammar", "Writing", "Speaking", "Vocabulary"],
  },
  {
    fullName: "Beatriz Nascimento Fontes",
    email: "beatriz.nascimento@arteeducacao.com.br",
    area: "Artes",
    bio: "Artista plástica e educadora formada pela ECA-USP. 9 anos de experiência em ensino de Artes Visuais, Música e Teatro. Acredito na arte como ferramenta de transformação social e desenvolvimento emocional dos jovens.",
    interests: ["Artes Visuais", "História da Arte", "Música Brasileira", "Cinema"],
  },
]

// ─── Posts por professor ──────────────────────────────────────────────────────

function makeHtml(paragraphs) {
  return paragraphs.map((p) => `<p>${p}</p>`).join("\n")
}

const postsByArea = {
  "Matemática": [
    {
      title: "Equações do 2° Grau: Do Zero à Fórmula de Bhaskara",
      body_html: makeHtml([
        "A equação do 2° grau é um dos tópicos mais importantes do Ensino Médio, e também um dos que mais geram dúvidas. Mas com a abordagem certa, você vai perceber que é muito mais simples do que parece.",
        "Uma equação do 2° grau tem a forma <strong>ax² + bx + c = 0</strong>, onde a ≠ 0. Os coeficientes a, b e c são números reais conhecidos, e x é a incógnita que queremos descobrir.",
        "O discriminante, ou delta (Δ), é calculado pela fórmula <strong>Δ = b² - 4ac</strong>. Ele nos diz quantas soluções reais a equação possui: se Δ > 0, temos duas raízes distintas; se Δ = 0, temos uma raiz dupla; se Δ < 0, não há raízes reais.",
        "A Fórmula de Bhaskara nos dá as raízes diretamente: <strong>x = (-b ± √Δ) / 2a</strong>. Com essa fórmula, conseguimos resolver qualquer equação do 2° grau de forma sistemática.",
        "Exemplo prático: resolva x² - 5x + 6 = 0. Temos a=1, b=-5, c=6. Calculando: Δ = 25 - 24 = 1. Portanto x = (5 ± 1) / 2, resultando em x₁ = 3 e x₂ = 2.",
        "Pratique com diferentes equações e logo você vai internalizar o processo. Lembre-se: matemática se aprende fazendo!",
      ]),
      tags: ["matemática", "algebra", "ensino-médio"],
    },
    {
      title: "Trigonometria: Entendendo Seno, Cosseno e Tangente",
      body_html: makeHtml([
        "Trigonometria é o estudo das relações entre os ângulos e os lados dos triângulos. O nome vem do grego e significa literalmente 'medida de triângulos'. Apesar de parecer abstrata, ela tem aplicações em arquitetura, engenharia, música e até em jogos digitais.",
        "No triângulo retângulo, definimos as três razões trigonométricas fundamentais em relação a um ângulo agudo θ:",
        "<strong>Seno (sen θ)</strong> = cateto oposto / hipotenusa<br><strong>Cosseno (cos θ)</strong> = cateto adjacente / hipotenusa<br><strong>Tangente (tan θ)</strong> = cateto oposto / cateto adjacente",
        "Uma identidade fundamental que você deve memorizar: <strong>sen²θ + cos²θ = 1</strong>. Esta relação vale para qualquer ângulo e é usada constantemente na resolução de problemas.",
        "Os valores notáveis são os ângulos 30°, 45° e 60°. Memorize esses valores pois eles aparecem com frequência em provas: sen 30° = 0,5; cos 60° = 0,5; sen 45° = cos 45° = √2/2; tan 45° = 1.",
        "Uma dica mnemônica: SOH-CAH-TOA. Seno = Oposto/Hipotenusa, Cosseno = Adjacente/Hipotenusa, Tangente = Oposto/Adjacente.",
      ]),
      tags: ["trigonometria", "geometria", "matemática"],
    },
    {
      title: "Matemática Financeira: Juros Simples vs Compostos",
      body_html: makeHtml([
        "Entender matemática financeira é essencial para tomar boas decisões no dia a dia — seja ao financiar um carro, investir dinheiro ou pagar uma dívida no cartão de crédito.",
        "No <strong>regime de juros simples</strong>, os juros incidem sempre sobre o capital inicial. A fórmula é <strong>M = C(1 + i·t)</strong>, onde M é o montante final, C é o capital, i é a taxa e t é o tempo.",
        "Já nos <strong>juros compostos</strong> (regime da maioria das operações financeiras reais), os juros se acumulam sobre o montante do período anterior — os famosos 'juros sobre juros'. A fórmula é <strong>M = C(1 + i)^t</strong>.",
        "Exemplo: R$ 1.000 a 10% ao mês por 3 meses. Em juros simples: M = 1000(1 + 0,1·3) = R$ 1.300. Em juros compostos: M = 1000(1,1)³ = R$ 1.331. A diferença parece pequena aqui, mas em prazos longos é enorme.",
        "Por isso o cartão de crédito rotativo é tão perigoso — taxas de 10-15% ao mês em juros compostos por 12 meses podem transformar uma dívida de R$ 1.000 em mais de R$ 3.000.",
        "Use sempre juros compostos para análise de investimentos e dívidas de longo prazo. Conhecer essa matemática é sua proteção contra armadilhas financeiras.",
      ]),
      tags: ["matemática financeira", "juros", "finanças"],
    },
    {
      title: "Progressão Aritmética: Conceitos e Aplicações",
      body_html: makeHtml([
        "Uma Progressão Aritmética (PA) é uma sequência numérica em que a diferença entre termos consecutivos é sempre constante. Essa diferença é chamada de razão da PA.",
        "Exemplos de PA: (2, 5, 8, 11, 14, ...) com razão r = 3; (10, 7, 4, 1, -2, ...) com razão r = -3; (5, 5, 5, 5, ...) com razão r = 0 (PA constante).",
        "O termo geral da PA é dado por: <strong>aₙ = a₁ + (n-1)·r</strong>. Para encontrar qualquer termo, basta saber o primeiro termo e a razão.",
        "A soma dos n primeiros termos de uma PA é calculada por: <strong>Sₙ = n(a₁ + aₙ)/2</strong>. Essa é uma fórmula elegante — multiplica o número de termos pela média entre o primeiro e o último.",
        "Aplicação clássica: Gauss, aos 9 anos, somou os números de 1 a 100 em segundos usando exatamente essa propriedade: S = 100(1+100)/2 = 5.050.",
        "As PA's aparecem em juros simples, tabelas price, cálculos de distâncias em queda livre uniforme e muitos outros contextos práticos.",
      ]),
      tags: ["PA", "sequências", "matemática"],
    },
    {
      title: "Probabilidade: Como Calcular as Chances de um Evento",
      body_html: makeHtml([
        "Probabilidade é a área da matemática que estuda a chance de ocorrência de eventos. Está presente no nosso cotidiano: na previsão do tempo, nos jogos, nos seguros e até nas decisões médicas.",
        "A probabilidade de um evento A é definida como: <strong>P(A) = n(A) / n(Ω)</strong>, onde n(A) é o número de casos favoráveis e n(Ω) é o número total de casos possíveis (espaço amostral).",
        "A probabilidade sempre está entre 0 e 1: P = 0 significa evento impossível; P = 1 significa evento certo. Podemos expressar como fração, decimal ou porcentagem.",
        "Evento complementar: P(Ā) = 1 - P(A). Se a probabilidade de chover é 30%, então a de não chover é 70%. Parece simples, mas é muito útil em problemas complexos.",
        "Para eventos independentes, a probabilidade de ambos ocorrerem é o produto das probabilidades individuais: P(A∩B) = P(A)·P(B).",
        "Exemplo: ao lançar dois dados, qual a probabilidade de sair 6 em ambos? P = (1/6)·(1/6) = 1/36 ≈ 2,78%. É raro, mas possível!",
      ]),
      tags: ["probabilidade", "estatística", "matemática"],
    },
    {
      title: "Geometria Analítica: Ponto e Reta no Plano Cartesiano",
      body_html: makeHtml([
        "Geometria Analítica é a fusão entre Álgebra e Geometria criada por René Descartes no século XVII. A ideia central é representar figuras geométricas através de equações algébricas em um sistema de coordenadas.",
        "O plano cartesiano é formado por dois eixos perpendiculares: o eixo x (abscissas) e o eixo y (ordenadas). Cada ponto do plano é representado por um par ordenado (x, y).",
        "A distância entre dois pontos P₁(x₁, y₁) e P₂(x₂, y₂) é calculada pela fórmula: <strong>d = √[(x₂-x₁)² + (y₂-y₁)²]</strong>. É uma aplicação direta do Teorema de Pitágoras.",
        "A equação geral da reta é <strong>ax + by + c = 0</strong>. A equação reduzida é <strong>y = mx + n</strong>, onde m é o coeficiente angular (inclinação da reta) e n é o coeficiente linear (ponto de interseção com o eixo y).",
        "Retas paralelas têm o mesmo coeficiente angular (m₁ = m₂). Retas perpendiculares satisfazem m₁·m₂ = -1.",
        "A Geometria Analítica é fundamental para Física (vetores, movimentos), Computação (gráficos, IA) e Engenharia (projetos, estruturas). Dominar esse conteúdo abre portas para inúmeras áreas.",
      ]),
      tags: ["geometria analítica", "álgebra", "matemática"],
    },
  ],

  "Física": [
    {
      title: "Leis de Newton: O Alicerce da Mecânica Clássica",
      body_html: makeHtml([
        "Isaac Newton publicou as três leis do movimento em 1687, no Principia Mathematica, e elas revolucionaram completamente a compreensão do universo. Mais de 300 anos depois, continuam sendo a base da engenharia e da física aplicada.",
        "<strong>1ª Lei — Inércia:</strong> Todo corpo em repouso permanece em repouso, e todo corpo em movimento retilíneo uniforme permanece assim, a não ser que uma força externa atue sobre ele. Isso explica por que você é jogado para frente no freio do ônibus.",
        "<strong>2ª Lei — Força e Aceleração:</strong> A força resultante sobre um corpo é igual ao produto da sua massa pela aceleração: <strong>F = m·a</strong>. Quanto maior a massa, menor a aceleração para a mesma força.",
        "<strong>3ª Lei — Ação e Reação:</strong> Para toda ação existe uma reação de mesma intensidade, mesma direção e sentido oposto. O foguete sobe porque expele gás para baixo; você anda porque empurra o chão para trás.",
        "Um erro clássico na 3ª Lei: as forças de ação e reação <em>não se anulam</em> porque atuam em corpos diferentes. A Terra puxa você para baixo com seu peso, e você puxa a Terra para cima com a mesma força — mas a Terra mal se move porque é incomensuravelmente mais massiva.",
        "As Leis de Newton são válidas apenas em referenciais inerciais (não acelerados). Para referenciais acelerados, precisamos de forças fictícias — mas isso é assunto para uma aula avançada!",
      ]),
      tags: ["física", "mecânica", "Newton"],
    },
    {
      title: "Termodinâmica: Calor, Temperatura e as Leis da Energia",
      body_html: makeHtml([
        "Termodinâmica é o ramo da Física que estuda as transformações de energia, especialmente a conversão entre calor e trabalho. Ela responde perguntas fundamentais: por que o calor sempre flui do quente para o frio? É possível criar energia do nada?",
        "<strong>0ª Lei:</strong> Se dois sistemas estão em equilíbrio térmico com um terceiro, eles estão em equilíbrio entre si. É a base do conceito de temperatura e do funcionamento dos termômetros.",
        "<strong>1ª Lei:</strong> Energia não se cria nem se destrói, apenas se transforma. Em termodinâmica: ΔU = Q - W, onde ΔU é a variação da energia interna, Q é o calor absorvido e W é o trabalho realizado.",
        "<strong>2ª Lei:</strong> O calor flui espontaneamente do corpo mais quente para o mais frio. A entropia de um sistema isolado sempre aumenta (ou permanece constante). Isso explica a irreversibilidade dos processos naturais.",
        "A eficiência máxima teórica de uma máquina térmica é dada pelo ciclo de Carnot: η = 1 - Tᶠ/Tq, onde as temperaturas são em Kelvin. Nenhuma máquina real consegue atingir essa eficiência ideal.",
        "A termodinâmica está por trás dos motores a combustão, geladeiras, usinas elétricas e até do metabolismo do nosso corpo. É uma das áreas mais práticas e fascinantes da Física.",
      ]),
      tags: ["termodinâmica", "energia", "física"],
    },
    {
      title: "Eletricidade: Corrente, Tensão e Resistência",
      body_html: makeHtml([
        "A eletricidade move o mundo moderno — literalmente. Entender seus fundamentos é essencial não só para a Física, mas para qualquer pessoa que vive em uma sociedade tecnológica.",
        "<strong>Corrente elétrica (I)</strong> é o fluxo ordenado de cargas elétricas por um condutor. É medida em Ampères (A). Em metais, são os elétrons livres que se movem; em soluções, são os íons.",
        "<strong>Tensão ou Diferença de Potencial (V)</strong> é a 'força' que impulsiona as cargas. É medida em Volts (V). A tensão doméstica no Brasil é de 127V ou 220V.",
        "<strong>Resistência elétrica (R)</strong> é a oposição que um material oferece ao fluxo de corrente. É medida em Ohms (Ω). Depende do material, comprimento, área da seção transversal e temperatura.",
        "<strong>Lei de Ohm:</strong> V = R·I. Para resistores ôhmicos, a tensão é proporcional à corrente. Este é um dos resultados mais importantes e práticos de toda a Física.",
        "Em circuitos em série, a corrente é a mesma em todos os elementos; a tensão se divide. Em circuitos em paralelo, a tensão é a mesma; a corrente se divide. Compreender isso é crucial para analisar qualquer circuito elétrico.",
      ]),
      tags: ["eletricidade", "física", "circuitos"],
    },
    {
      title: "Óptica: Reflexão e Refração da Luz",
      body_html: makeHtml([
        "Óptica é o ramo da Física que estuda os fenômenos relacionados à luz. É responsável por tecnologias como óculos, câmeras, microscópios, telescópios, fibras ópticas e lasers.",
        "A <strong>reflexão</strong> ocorre quando a luz encontra uma superfície e é rebatida. A lei da reflexão diz: o ângulo de incidência é igual ao ângulo de reflexão (medidos em relação à normal à superfície).",
        "Espelhos planos formam imagens virtuais, direitas e do mesmo tamanho. Espelhos côncavos podem formar imagens reais e invertidas (usados em faróis e telescópios refletores). Espelhos convexos formam imagens menores e sempre virtuais (usados em retrovisores).",
        "A <strong>refração</strong> é a mudança de direção da luz ao passar de um meio para outro com índice de refração diferente. Lei de Snell-Descartes: n₁·sen θ₁ = n₂·sen θ₂.",
        "O índice de refração mede quanto a luz desacelera ao entrar no meio. No vácuo, n = 1; no vidro, n ≈ 1,5; no diamante, n ≈ 2,4. Por isso diamantes brilham tanto — a luz sofre reflexão total interna e é devolvida em todas as direções.",
        "A dispersão da luz (separação em cores pelo prisma) acontece porque diferentes comprimentos de onda refratam em ângulos ligeiramente diferentes. É assim que surge o arco-íris!",
      ]),
      tags: ["óptica", "luz", "física"],
    },
    {
      title: "Ondas: Mecânicas e Eletromagnéticas",
      body_html: makeHtml([
        "Ondas são perturbações que se propagam transferindo energia sem transferir matéria. Estão em todo lugar: no som que você ouve, na luz que você vê, no calor que você sente e nas ondas de rádio que carregam seu sinal de celular.",
        "As <strong>ondas mecânicas</strong> precisam de um meio material para se propagar (ar, água, sólidos). O som é um exemplo: é uma onda longitudinal de compressão e rarefação do ar. No vácuo, não há som.",
        "As <strong>ondas eletromagnéticas</strong> não precisam de meio material — se propagam no vácuo. Luz, rádio, micro-ondas, raios-X são todos ondas eletromagnéticas com diferentes frequências e comprimentos de onda.",
        "Características fundamentais: frequência (f) é o número de oscilações por segundo, medida em Hertz; comprimento de onda (λ) é a distância entre duas cristas consecutivas; velocidade (v) relaciona os dois: <strong>v = f·λ</strong>.",
        "O fenômeno Doppler explica por que o som de uma ambulância parece mais agudo quando se aproxima e mais grave quando se afasta. Também é usado em radares de velocidade e ultrassonografia.",
        "A <strong>ressonância</strong> ocorre quando um sistema é excitado na sua frequência natural de vibração, com consequências que vão do belo (a harmonia musical) ao catastrófico (a ponte de Tacoma Narrows, que colapsou em 1940).",
      ]),
      tags: ["ondas", "som", "física"],
    },
  ],

  "História": [
    {
      title: "A Revolução Industrial: Transformação do Mundo Moderno",
      body_html: makeHtml([
        "A Revolução Industrial, iniciada na Inglaterra no século XVIII, foi uma das maiores transformações da história humana. Em poucas décadas, sociedades agrárias se tornaram industriais, e o mundo nunca mais foi o mesmo.",
        "As condições que fizeram da Inglaterra o berço da Revolução incluem: acesso ao carvão e ferro, estabilidade política, expansão colonial (matérias-primas e mercado consumidor), capital acumulado pelo comércio e cultura burguesa favorável à inovação.",
        "A máquina a vapor de James Watt (aperfeiçoada em 1769) foi o coração da 1ª Revolução Industrial. Ela mecanizou a produção têxtil, permitiu a construção das ferrovias e transformou completamente os processos produtivos.",
        "A 2ª Revolução Industrial (1850-1900) trouxe o aço, a eletricidade e o petróleo como novos motores. Surgem as grandes corporações, a produção em massa e o imperialismo moderno, com potências europeias disputando territórios na África e Ásia.",
        "As consequências sociais foram profundas: surgimento do proletariado industrial, urbanização acelerada, condições de trabalho degradantes (crianças trabalhando 14h/dia), nascimento dos sindicatos e dos movimentos socialistas.",
        "A Revolução Industrial moldou diretamente o capitalismo que conhecemos hoje, os conflitos do século XX, e os desafios ambientais que enfrentamos no XXI. Entender sua história é entender o presente.",
      ]),
      tags: ["história", "revolução industrial", "modernidade"],
    },
    {
      title: "Primeira Guerra Mundial: As Origens de um Conflito Global",
      body_html: makeHtml([
        "A Primeira Guerra Mundial (1914-1918) foi o primeiro conflito verdadeiramente global da história, envolvendo as principais potências mundiais e resultando em mais de 20 milhões de mortos. Compreender suas causas é essencial para entender o século XX.",
        "O modelo MAIN resume as causas estruturais: <strong>M</strong>ilitarismo (corrida armamentista entre potências), <strong>A</strong>lianças (Triple Entente x Tríplice Aliança), <strong>I</strong>mperialismo (rivalidades por colônias) e <strong>N</strong>acionalismo (especialmente nos Bálcãs).",
        "O estopim foi o assassinato do Arquiduque Francisco Fernando da Áustria-Hungria em Sarajevo, em 28 de junho de 1914, por Gavrilo Princip, um nacionalista sérvio-bósnio. Em semanas, o sistema de alianças arrastou toda a Europa para a guerra.",
        "A guerra trouxe inovações tecnológicas terríveis: gás venenoso, tanques, aviões militares, guerra submarina. As trincheiras na Frente Ocidental simbolizam o horror de um conflito estático, com exércitos se massacrando por metros de terreno.",
        "O Tratado de Versalhes (1919) impôs condições humilhantes à Alemanha: perda de território, indenizações bilionárias, 'cláusula de culpa de guerra'. Muitos historiadores veem esse tratado como a semente direta do nazismo e da Segunda Guerra.",
        "A Grande Guerra destruiu quatro impérios (Austro-Húngaro, Otomano, Russo e Alemão), redesenhou o mapa mundial e gerou instabilidades que ressoam até hoje — especialmente no Oriente Médio.",
      ]),
      tags: ["primeira guerra", "história mundial", "século XX"],
    },
    {
      title: "O Brasil Colonial: Economia e Sociedade nos Séculos XVI-XVIII",
      body_html: makeHtml([
        "O Brasil colonial foi marcado por uma estrutura econômica voltada para o exterior — o chamado sistema colonial — em que a colônia existia para beneficiar a metrópole portuguesa. Esse modelo deixou marcas profundas na sociedade brasileira.",
        "O <strong>Pacto Colonial</strong> obrigava o Brasil a comercializar exclusivamente com Portugal, proibia manufaturas locais e garantia o monopólio comercial à metrópole. A colônia fornecia matérias-primas e comprava produtos industrializados.",
        "O primeiro ciclo econômico foi o do <strong>Pau-Brasil</strong> (séc. XVI), explorado com mão de obra indígena através do escambo. Rapidamente substituído pela cana-de-açúcar no Nordeste, que exigiu a importação massiva de africanos escravizados.",
        "O <strong>ciclo do açúcar</strong> (séc. XVI-XVII) criou a plantation — grandes propriedades com trabalho escravo. O nordeste se tornou a região mais rica do mundo nesse período, mas a riqueza ficou concentrada nas mãos dos senhores de engenho.",
        "A descoberta de <strong>ouro em Minas Gerais</strong> (1693) deslocou o centro econômico para o sudeste e provocou a maior migração da história colonial. A Coroa intensificou o controle fiscal (Derrama), alimentando tensões que culminariam na Inconfidência Mineira (1789).",
        "A sociedade colonial era rigidamente hierarquizada: colonizadores brancos no topo, seguidos por brancos pobres, mestiços, indígenas 'domesticados' e, na base, africanos escravizados. Essa estrutura de desigualdade ainda ecoa na sociedade brasileira atual.",
      ]),
      tags: ["brasil colonial", "história do Brasil", "colonização"],
    },
    {
      title: "Era Vargas: Populismo e Modernização no Brasil",
      body_html: makeHtml([
        "A Era Vargas (1930-1945 e 1950-1954) foi um período decisivo na formação do Brasil moderno. Getúlio Vargas modernizou o Estado, industrializou o país, criou a legislação trabalhista — mas também instaurou uma ditadura e cerceou liberdades.",
        "Vargas chegou ao poder após a Revolução de 1930, que encerrou a República Velha dominada pela política café-com-leite (alternância entre São Paulo e Minas Gerais). Representava os interesses de setores militares, oligarquias regionais dissidentes e a burguesia industrial.",
        "O <strong>Estado Novo</strong> (1937-1945) foi o período ditatorial do varguismo. Vargas fechou o Congresso, outorgou uma Constituição autoritária, perseguiu comunistas e integralistas, controlou a imprensa e centralizou o poder. Mas também acelerou a industrialização e criou a CLT.",
        "A <strong>Consolidação das Leis do Trabalho (CLT)</strong>, de 1943, é talvez o legado mais duradouro de Vargas. Regulamentou férias, jornada de trabalho, salário mínimo e proteções trabalhistas — tornando Vargas o 'pai dos pobres' na visão popular.",
        "Vargas voltou ao poder por eleição em 1950, mas enfrentou oposição crescente, especialmente da UDN e de setores militares ligados aos EUA. Pressionado a renunciar, suicidou-se em 24 de agosto de 1954, deixando uma carta que agitou o Brasil.",
        "O getulismo criou padrões políticos — populismo, trabalhismo, nacionalismo econômico — que influenciaram décadas de política brasileira, de Jango a Lula.",
      ]),
      tags: ["era Vargas", "história do Brasil", "populismo"],
    },
    {
      title: "Ditadura Militar no Brasil (1964-1985)",
      body_html: makeHtml([
        "O período da Ditadura Militar brasileira, iniciado com o golpe de 1° de abril de 1964, durou 21 anos e deixou cicatrizes profundas na democracia, na memória coletiva e nos direitos humanos do país.",
        "O golpe derrubou o presidente João Goulart (Jango), que propunha as 'Reformas de Base' — reforma agrária, controle de remessas de lucros ao exterior, alfabetização em massa. Foi apoiado por militares, empresários, setores conservadores da Igreja e pelos EUA, que temiam um 'novo Cuba'.",
        "O regime se endureceu progressivamente. O <strong>AI-5</strong> (1968) foi o momento mais repressivo: fechou o Congresso, suspendeu habeas corpus, institucionalizou a tortura. O 'milagre econômico' (1968-1973) com crescimento de 10% ao ano mascarou internacionalmente a brutalidade.",
        "A resistência foi múltipla: guerrilha armada (ALN, MR-8, PCdoB), movimento estudantil, artistas e intelectuais usando a linguagem tropicalista e a MPB como resistência cultural, advogados e religiosos defensores dos direitos humanos.",
        "A <strong>Comissão Nacional da Verdade</strong> (2012-2014) documentou 434 mortes e desaparecimentos forçados e reconheceu a prática sistemática de tortura. O Brasil ainda não responsabilizou judicialmente os perpetradores — ao contrário de Argentina e Chile.",
        "A redemocratização se deu gradualmente: anistia em 1979, eleições diretas para governadores em 1982 e, após a campanha pelas Diretas Já (1984), a eleição indireta de Tancredo Neves e a Constituição de 1988. A democracia foi reconquistada, mas permanece em constante disputa.",
      ]),
      tags: ["ditadura militar", "história do Brasil", "democracia"],
    },
  ],

  "Biologia": [
    {
      title: "A Célula: Unidade Fundamental da Vida",
      body_html: makeHtml([
        "A teoria celular, enunciada por Schleiden, Schwann e Virchow no século XIX, estabelece que todo ser vivo é composto por células, e que toda célula origina-se de outra célula preexistente. É um dos pilares da Biologia moderna.",
        "As células se dividem em dois grandes grupos: <strong>procariontes</strong> (sem núcleo definido, como bactérias e arqueas) e <strong>eucariontes</strong> (com núcleo envolto por membrana, como animais, plantas, fungos e protistas).",
        "A <strong>membrana plasmática</strong> é uma bicamada fosfolipídica que delimita a célula e controla o que entra e sai. É seletivamente permeável — um porteiro molecular fundamental para a homeostase celular.",
        "O <strong>núcleo</strong> é o centro de controle da célula eucarionte. Contém o DNA organizado em cromossomos, guarda a informação genética e coordena a síntese de proteínas através do RNA mensageiro.",
        "As <strong>mitocôndrias</strong> são as 'usinas de energia' da célula — realizam a respiração celular aeróbica, convertendo glicose e O₂ em ATP. Nas células vegetais, os cloroplastos realizam a fotossíntese, convertendo energia luminosa em energia química.",
        "Doenças como câncer, Alzheimer e muitas infecções virais têm origem em disfunções celulares. Por isso, compreender a biologia celular é o ponto de partida para qualquer área da saúde e das biociências.",
      ]),
      tags: ["biologia celular", "célula", "biologia"],
    },
    {
      title: "Genética: DNA, Genes e Hereditariedade",
      body_html: makeHtml([
        "A genética é a ciência da hereditariedade — ela explica por que filhos se parecem com os pais, como surgem doenças genéticas e como a informação biológica é transmitida de geração em geração.",
        "O <strong>DNA</strong> (ácido desoxirribonucleico) é a molécula que carrega a informação genética. É uma dupla-hélice formada por nucleotídeos com quatro bases nitrogenadas: Adenina (A), Timina (T), Guanina (G) e Citosina (C). A-T e G-C sempre se pareiam.",
        "Um <strong>gene</strong> é um segmento de DNA que codifica uma proteína ou tem função regulatória. O genoma humano tem cerca de 3 bilhões de pares de bases e aproximadamente 20.000 genes codificadores.",
        "<strong>Gregor Mendel</strong> (séc. XIX) descobriu as leis da hereditariedade estudando ervilhas. Sua 1ª Lei (segregação) diz que cada característica é controlada por dois fatores (alelos) que se separam na formação dos gametas. A 2ª Lei (assortment independente) descreve como características diferentes são herdadas independentemente.",
        "O <strong>Projeto Genoma Humano</strong> (concluído em 2003) sequenciou todo o DNA humano, abrindo caminho para a medicina personalizada, testes genéticos preditivos e terapias gênicas. CRISPR-Cas9 permite agora editar o DNA com precisão cirúrgica.",
        "Doenças genéticas como hemofilia, anemia falciforme e síndrome de Down têm base na alteração dos genes ou cromossomos. Compreender a genética é essencial para a medicina preventiva e o aconselhamento genético.",
      ]),
      tags: ["genética", "DNA", "hereditariedade"],
    },
    {
      title: "Ecossistemas Brasileiros: Da Amazônia ao Cerrado",
      body_html: makeHtml([
        "O Brasil abriga a maior biodiversidade do planeta. São seis biomas principais: Amazônia, Cerrado, Mata Atlântica, Caatinga, Pampa e Pantanal — cada um com características únicas e ameaças específicas.",
        "A <strong>Amazônia</strong> é a maior floresta tropical do mundo, cobrindo 60% do território brasileiro. Abriga mais de 10% de todas as espécies de flora e fauna do planeta. Sua floresta regula o clima regional e global através do 'rio voador' de vapor d'água.",
        "O <strong>Cerrado</strong>, segundo maior bioma brasileiro, é a savana mais rica em biodiversidade do mundo. Mais de 50% já foi destruído para agropecuária — um desastre ambiental pouco noticiado em comparação com a Amazônia.",
        "A <strong>Mata Atlântica</strong> é um dos biomas mais ameaçados do planeta — restam apenas 12% de sua cobertura original. Ainda assim, abriga mais de 20.000 espécies vegetais e é o lar de 72% dos brasileiros.",
        "A <strong>Caatinga</strong> é o único bioma exclusivamente brasileiro, adaptado ao semiárido nordestino. Longe de ser um 'deserto', é uma floresta única com adaptações extraordinárias à seca: cactos, mandacaru, abelhas-sem-ferrão.",
        "O desmatamento, as queimadas e as mudanças climáticas ameaçam esses ecossistemas. Preservá-los não é só questão ambiental — é segurança hídrica, alimentar e climática para todo o país.",
      ]),
      tags: ["ecossistemas", "biomas brasileiros", "biologia"],
    },
    {
      title: "Evolução: Darwin e a Seleção Natural",
      body_html: makeHtml([
        "A Teoria da Evolução por Seleção Natural, proposta por Charles Darwin em 'A Origem das Espécies' (1859), é o princípio unificador de toda a Biologia. Como disse o geneticista Theodosius Dobzhansky: 'Nada em Biologia faz sentido, exceto à luz da evolução'.",
        "Darwin observou que: 1) os indivíduos de uma população variam em suas características; 2) parte dessa variação é herdável; 3) mais indivíduos nascem do que o ambiente suporta; 4) portanto, os mais adaptados ao ambiente sobrevivem e reproduzem mais.",
        "A <strong>seleção natural</strong> não é aleatória — ela 'seleciona' características vantajosas para o ambiente atual. Mas a variação sobre a qual ela atua (mutações) é aleatória. Evolução não tem 'objetivo' ou 'direção' — é uma consequência de processos físico-químicos.",
        "A <strong>Teoria Sintética</strong> (neo-darwinismo) une a teoria de Darwin com a genética mendeliana e molecular. A evolução é a mudança na frequência de alelos em uma população ao longo do tempo — seleção natural, deriva genética, mutação e fluxo gênico são os mecanismos.",
        "Evidências da evolução são abundantes e convergentes: registro fóssil, anatomia comparada (homologias e vestígios), biogeografia, embriologia comparada e, mais decisivamente, a genética molecular — o DNA de todas as espécies usa o mesmo código genético.",
        "Resistência a antibióticos em bactérias e a pesticidas em insetos são exemplos de evolução em tempo real que vemos acontecer. Entender evolução é fundamental para a medicina, a agricultura e a conservação da biodiversidade.",
      ]),
      tags: ["evolução", "Darwin", "seleção natural"],
    },
    {
      title: "Fisiologia: O Sistema Cardiovascular",
      body_html: makeHtml([
        "O sistema cardiovascular é responsável pela circulação do sangue, distribuindo oxigênio, nutrientes e hormônios por todo o organismo, além de remover resíduos metabólicos. É literalmente o sistema de transporte do corpo.",
        "O <strong>coração</strong> é uma bomba muscular dupla com quatro câmaras: dois átrios (recebem sangue) e dois ventrículos (bombeiam sangue). O coração direito bombeia sangue para os pulmões (circulação pulmonar); o esquerdo bombeia para o resto do corpo (circulação sistêmica).",
        "O sangue percorre dois circuitos: a <strong>pequena circulação</strong> (coração → pulmões → coração) oxigena o sangue e elimina CO₂; a <strong>grande circulação</strong> (coração → corpo → coração) leva O₂ e nutrientes aos tecidos e retorna com CO₂ e resíduos.",
        "As <strong>artérias</strong> conduzem sangue do coração; as <strong>veias</strong> conduzem sangue ao coração; os <strong>capilares</strong> são os micro-vasos onde ocorrem as trocas entre sangue e tecidos. Ao contrário do senso comum, nem toda artéria leva sangue oxigenado (a artéria pulmonar leva sangue venoso).",
        "A <strong>pressão arterial</strong> é a força que o sangue exerce nas paredes das artérias. Hipertensão (>140/90 mmHg) é um fator de risco para infarto e AVC — as principais causas de morte no Brasil.",
        "Hábitos que protegem o coração: atividade física regular, dieta rica em fibras e pobre em sódio/gordura saturada, não fumar, controlar o estresse. Doenças cardiovasculares respondem por 30% das mortes no Brasil, mas 80% são evitáveis.",
      ]),
      tags: ["fisiologia", "circulação", "saúde"],
    },
  ],

  "Língua Portuguesa": [
    {
      title: "Redação ENEM: Estrutura e Estratégias para a Nota 1000",
      body_html: makeHtml([
        "A redação do ENEM é avaliada em cinco competências, cada uma valendo até 200 pontos. Entender o que cada competência exige é o primeiro passo para uma nota alta. Neste post, vou detalhar cada uma delas.",
        "<strong>C1 — Domínio da norma culta:</strong> uso correto da gramática, pontuação, ortografia e concordância. Erros gramaticais custam pontos, mas a prova não exige português perfeito — exige adequação à norma formal.",
        "<strong>C2 — Compreensão da proposta:</strong> você deve escrever uma dissertação-argumentativa sobre o tema, usando os textos motivadores como ponto de partida, não como limite. Fuja de paráfrases — construa argumentos próprios.",
        "<strong>C3 — Seleção de argumentos:</strong> use dados, exemplos históricos, referências culturais e filosóficas para sustentar sua tese. O argumento de autoridade (citar filósofos, cientistas, escritores) é muito valorizado pelos corretores.",
        "<strong>C4 — Coesão e coerência:</strong> o texto deve fluir naturalmente, com conectivos bem usados e ideias logicamente encadeadas. Evite repetições desnecessárias e certifique-se de que cada parágrafo se conecta ao anterior.",
        "<strong>C5 — Proposta de intervenção:</strong> toda redação ENEM deve terminar com uma proposta de solução detalhada, com agente, ação, modo, efeito e finalidade. Soluções vagas como 'o governo deve investir em educação' não pontuam bem.",
      ]),
      tags: ["ENEM", "redação", "português"],
    },
    {
      title: "Figuras de Linguagem: Guia Completo com Exemplos",
      body_html: makeHtml([
        "As figuras de linguagem são recursos expressivos que enriquecem o texto, tornando-o mais eloquente, persuasivo ou poético. Dominá-las é essencial para interpretar textos literários e para escrever com estilo.",
        "<strong>Metáfora:</strong> comparação implícita entre termos de diferentes naturezas. 'Ele é um leão em campo' (não literalmente, mas expressa bravura). Diferente do símile, que usa 'como': 'Ele luta como um leão'.",
        "<strong>Metonímia:</strong> substituição de um termo por outro com o qual tem relação lógica. 'Não li ainda Machado de Assis' (a obra pelo autor). 'O Brasil venceu por 2 a 0' (o país pela seleção).",
        "<strong>Hipérbole:</strong> exageração com fins expressivos. 'Estou morrendo de fome'; 'Te liguei mil vezes'. O exagero não engana — comunica intensidade emocional.",
        "<strong>Ironia:</strong> diz-se o contrário do que se quer comunicar, com intenção crítica ou humorística. Requer contexto para ser interpretada corretamente. Muito usada em crônicas e textos de opinião.",
        "<strong>Antítese:</strong> oposição de ideias. 'Era o melhor dos tempos, era o pior dos tempos' (Dickens). <strong>Paradoxo:</strong> afirmação aparentemente contraditória mas com verdade subjacente. 'Quem sabe não fala; quem fala não sabe' (Lao-Tsé).",
      ]),
      tags: ["figuras de linguagem", "literatura", "português"],
    },
    {
      title: "Análise Sintática: Sujeito e Predicado Descomplicados",
      body_html: makeHtml([
        "A análise sintática estuda as funções que os termos desempenham na frase. Longe de ser um exercício meramente mecânico, ela revela a arquitetura do pensamento expresso na língua.",
        "O <strong>sujeito</strong> é o ser sobre o qual o predicado diz algo. Concorda com o verbo em número e pessoa. Tipos: simples (um núcleo: 'João viajou'), composto (dois ou mais núcleos: 'João e Maria viajaram'), indeterminado (não identificável: 'Venderam o imóvel'), oculto/elíptico (identificado pela desinência verbal: 'Viajei').",
        "O <strong>predicado</strong> é o que se afirma sobre o sujeito. Pode ser: verbal (verbo de ação, sem predicativo: 'O aluno estudou muito'), nominal (verbo de ligação + predicativo do sujeito: 'O aluno está cansado') ou verbo-nominal (dois núcleos: 'O aluno chegou cansado').",
        "Os <strong>verbos de ligação</strong> (ser, estar, ficar, parecer, continuar, tornar-se) ligam o sujeito ao seu predicativo. São responsáveis pela construção nominal do predicado.",
        "Termos integrantes completam o sentido do verbo: <strong>objeto direto</strong> (sem preposição: 'Comprei o livro') e <strong>objeto indireto</strong> (com preposição: 'Gosto de música'). Termos acessórios modificam outros termos: adjunto adnominal (qualifica substantivo) e adjunto adverbial (modifica verbo/adjetivo).",
        "Dica prática: antes de analisar sintaticamente, leia o período inteiro, identifique o verbo principal e pergunte 'quem pratica a ação?' (sujeito) e 'o que a ação incide?' (objeto). A lógica é mais importante que a memorização de categorias.",
      ]),
      tags: ["sintaxe", "gramática", "português"],
    },
    {
      title: "Modernismo Brasileiro: A Semana de 22 e seus Desdobramentos",
      body_html: makeHtml([
        "O Modernismo brasileiro nasceu oficialmente com a Semana de Arte Moderna de 1922, realizada no Teatro Municipal de São Paulo. O evento foi uma ruptura radical com o passado literário e artístico, e ainda hoje ecoa na cultura brasileira.",
        "Os modernistas tinham três projetos complementares: destruir (a linguagem parnasiana e o academicismo), construir (uma literatura verdadeiramente brasileira, com a língua falada no Brasil) e descobrir (o Brasil real, suas raízes indígenas e africanas).",
        "A <strong>Primeira Fase</strong> (1922-1930) foi a fase heroica e destrutiva. Mario de Andrade com 'Macunaíma' e Oswald de Andrade com o 'Manifesto Antropófago' ('Tupy or not tupy, that is the question') são seus ícones. Manuel Bandeira modernizou a poesia com o verso livre.",
        "A <strong>Segunda Fase</strong> (1930-1945) foi mais madura e engajada. Surgem os grandes romances sociais: Graciliano Ramos ('Vidas Secas', 'Memórias do Cárcere'), Jorge Amado ('Capitães da Areia'), Rachel de Queiroz ('O Quinze'), José Lins do Rego ('Menino de Engenho'). O Nordeste se torna tema central.",
        "A <strong>Terceira Fase</strong> (1945-1960) foi marcada pelo rigor formal na poesia (João Cabral de Melo Neto) e pela prosa introspectiva de Guimarães Rosa, cujo 'Grande Sertão: Veredas' (1956) é considerado o maior romance brasileiro.",
        "O legado modernista é imenso: a língua literária brasileira se tornou mais próxima do português falado; surgiu uma literatura comprometida com as questões sociais; consolidou-se uma identidade cultural plural, que abraça as raízes indígenas, africanas e europeias.",
      ]),
      tags: ["modernismo", "literatura brasileira", "semana de 22"],
    },
    {
      title: "Crase: Quando Usar (e Quando Não Usar) o Acento Grave",
      body_html: makeHtml([
        "Crase é a fusão da preposição 'a' com o artigo definido feminino 'a', representada pelo acento grave (à). É um dos tópicos mais temidos da gramática — mas com a regra certa, fica simples.",
        "A regra básica: use crase quando houver preposição 'a' + artigo 'a' antes de palavra feminina. Teste: substitua a palavra feminina por uma masculina equivalente. Se usar 'ao', use crase no feminino. 'Fui ao mercado' → 'Fui à escola' (crase). 'Fui a pé' → sem crase (não usa 'ao pé').",
        "Casos obrigatórios: antes de horas determinadas ('às 10h'), em locuções adverbiais femininas ('às vezes', 'à noite', 'à tarde'), em locuções prepositivas ('à beira de', 'à frente de'), antes de 'moda de' e 'maneira de' (à francesa, à brasileira).",
        "Casos proibidos: antes de verbos ('Estou disposto a ajudar'), antes de palavras masculinas ('Fui a pé'), antes de nomes próprios de pessoas ('Entreguei a Maria'), antes de pronomes pessoais e de tratamento ('Dirigi-me a ela', 'Faço referência a Vossa Excelência').",
        "Crase facultativa: antes de pronomes possessivos ('Entreguei à/a sua professora'), antes de nomes de cidades sem artigo definido ('Fui à/a Paris') — mas se a cidade tiver artigo, é obrigatória ('Fui à Bahia').",
        "Dica final: o acento grave indica crase especificamente. Não confunda com o acento grave em 'è' (nas palavras 'àquele', 'àquela', 'àquilo' — contração de 'a' com pronome demonstrativo) que também é correto.",
      ]),
      tags: ["gramática", "crase", "português"],
    },
  ],

  "Química": [
    {
      title: "Tabela Periódica: Lendo a Linguagem dos Elementos",
      body_html: makeHtml([
        "A Tabela Periódica, organizada por Dmitri Mendeleev em 1869 e aperfeiçoada ao longo do século XX, é o mapa do mundo microscópico. Ela organiza os 118 elementos conhecidos de forma que suas propriedades possam ser previstas pela posição.",
        "A tabela é organizada por <strong>número atômico</strong> (número de prótons no núcleo) crescente, da esquerda para a direita e de cima para baixo. As <strong>linhas horizontais</strong> são os períodos (7 no total); as <strong>colunas verticais</strong> são os grupos (18 no total).",
        "Elementos do mesmo grupo têm o mesmo número de elétrons na camada de valência e, portanto, propriedades químicas similares. O Grupo 1 (metais alcalinos) é altamente reativo; o Grupo 18 (gases nobres) é estável e pouco reativo.",
        "Propriedades periódicas variam de forma previsível: <strong>raio atômico</strong> aumenta de cima para baixo e da direita para a esquerda; <strong>eletronegatividade</strong> aumenta da esquerda para a direita e de baixo para cima; <strong>energia de ionização</strong> (energia para remover um elétron) segue tendência oposta ao raio.",
        "Os <strong>metais</strong> (maioria da tabela) conduzem eletricidade, são maleáveis e ducteis. Os <strong>não-metais</strong> são maus condutores e formam ânions. Os <strong>semimetais</strong> (como o silício) têm propriedades intermediárias — são os semicondutores usados em chips.",
        "Curiosidade: os elementos de número 43 (Tecnécio) e 61 (Promécio) não existem naturalmente na Terra — são produzidos artificialmente. Os elementos após o Urânio (Z>92) são todos artificiais, criados em aceleradores de partículas.",
      ]),
      tags: ["tabela periódica", "química", "elementos"],
    },
    {
      title: "Ligações Químicas: Por Que os Átomos se Unem?",
      body_html: makeHtml([
        "Os átomos tendem a se unir para atingir maior estabilidade energética, geralmente completando sua camada de valência com 8 elétrons (regra do octeto). As ligações químicas são os 'contratos' que os átomos fazem para alcançar esse estado.",
        "Na <strong>ligação iônica</strong>, elétrons são transferidos de um átomo para outro, formando íons de cargas opostas que se atraem eletrostaticamente. Ocorre tipicamente entre metais e não-metais. Exemplo: NaCl (sal de cozinha) — o Na cede um elétron ao Cl, formando Na⁺ e Cl⁻.",
        "Na <strong>ligação covalente</strong>, elétrons são compartilhados entre átomos. Ocorre entre não-metais. Pode ser simples (1 par compartilhado, como H₂), dupla (2 pares, como O₂) ou tripla (3 pares, como N₂). O compartilhamento pode ser polar (elétrons mais perto de um átomo) ou apolar.",
        "Na <strong>ligação metálica</strong>, os elétrons da camada de valência se desligam dos átomos e formam uma 'nuvem eletrônica' que permeia toda a estrutura. Isso explica as propriedades dos metais: condutividade elétrica e térmica, brilho, maleabilidade.",
        "Ligações mais fracas, mas igualmente importantes: as <strong>forças de Van der Waals</strong> (entre moléculas apolares) e as <strong>ligações de hidrogênio</strong> (entre moléculas com H ligado a N, O ou F). As ligações de hidrogênio explicam por que a água tem ponto de ebulição tão alto para seu peso molecular.",
        "A geometria molecular (determinada pelo modelo VSEPR) tem consequências enormes nas propriedades: a água (H₂O) é angular e polar, o que a torna excelente solvente. O CO₂ é linear e apolar, por isso não dissolve bem em gorduras.",
      ]),
      tags: ["ligações químicas", "iônica", "covalente"],
    },
    {
      title: "Reações Químicas: Balanceamento e Tipos",
      body_html: makeHtml([
        "Uma reação química é um processo em que substâncias (reagentes) se transformam em novas substâncias (produtos) com diferentes propriedades. A lei de conservação da massa (Lavoisier) diz que a massa total é conservada — daí a necessidade de balancear equações.",
        "Para <strong>balancear uma equação</strong>, iguala-se o número de átomos de cada elemento nos dois lados, ajustando os coeficientes estequiométricos (nunca os índices, que mudariam a substância). Exemplo: H₂ + O₂ → H₂O. Balanceada: 2H₂ + O₂ → 2H₂O.",
        "<strong>Tipos de reações</strong>: síntese (A + B → AB); decomposição (AB → A + B); deslocamento simples (A + BC → AC + B, quando A é mais reativo que B na série de reatividade); dupla troca (AB + CD → AD + CB, gerando precipitado, gás ou água).",
        "As <strong>reações de oxidação-redução (redox)</strong> envolvem transferência de elétrons. Oxidação é a perda de elétrons (número de oxidação aumenta); redução é o ganho (NOX diminui). Sempre ocorrem juntas — o que uma substância perde, outra ganha.",
        "A <strong>estequiometria</strong> permite calcular quantidades de reagentes e produtos em uma reação. Usando a relação entre moles (1 mol de qualquer substância contém 6,02×10²³ partículas — o Número de Avogadro), podemos converter entre massa, volume e número de partículas.",
        "Catalisadores aceleram reações químicas sem serem consumidos. As enzimas do nosso metabolismo são catalisadores biológicos — sem elas, reações essenciais à vida levariam anos para acontecer espontaneamente.",
      ]),
      tags: ["reações químicas", "balanceamento", "estequiometria"],
    },
    {
      title: "Química Orgânica: Hidrocarbonetos e Funções Orgânicas",
      body_html: makeHtml([
        "A Química Orgânica estuda os compostos do carbono. Não por acaso — o carbono tem uma capacidade única de formar longas cadeias e anéis, criando a imensa diversidade molecular que sustenta a vida e a indústria química.",
        "O carbono tem quatro ligações disponíveis (valência 4), podendo se ligar a outros carbonos, hidrogênios, oxigênio, nitrogênio e outros átomos. Pode formar cadeias abertas (alifáticas) ou fechadas (cíclicas), saturadas (só ligações simples) ou insaturadas (com duplas ou triplas).",
        "Os <strong>hidrocarbonetos</strong> contêm apenas C e H. Alcanos (CₙH₂ₙ₊₂): só ligações simples; são encontrados no petróleo e gás natural. Alcenos (CₙH₂ₙ): possuem dupla ligação (exemplo: etileno, usado para fazer polietileno). Alcinos: têm ligação tripla. Aromáticos: contêm anel benzênico.",
        "As <strong>funções orgânicas</strong> são grupos de átomos que conferem propriedades específicas: álcoois (–OH): etanol, propanol; ácidos carboxílicos (–COOH): ácido acético (vinagre), ácido cítrico; ésteres (–COO–): perfumes e gorduras; aminas (–NH₂): proteínas.",
        "As <strong>reações orgânicas</strong> mais importantes: adição (adiciona átomos à dupla ligação — base do plástico PVC e PET); substituição (troca um átomo por outro — base dos combustíveis fósseis); eliminação (remove átomos formando duplas ligações).",
        "A isomeria é fascinante: compostos com a mesma fórmula molecular mas estruturas diferentes têm propriedades completamente distintas. Glicose e frutose são isômeros — mesma fórmula (C₆H₁₂O₆), mas sabores e propriedades diferentes.",
      ]),
      tags: ["química orgânica", "hidrocarbonetos", "funções orgânicas"],
    },
    {
      title: "Eletroquímica: Pilhas, Baterias e Eletrólise",
      body_html: makeHtml([
        "Eletroquímica é o campo que conecta reações químicas com eletricidade. É a ciência por trás das pilhas do controle remoto, das baterias de lítio do celular e do processo que reveste joias com ouro.",
        "Uma <strong>pilha</strong> (célula galvânica) converte energia química em elétrica através de uma reação redox espontânea. É composta por dois eletrodos em soluções iônicas (eletrólitos) conectados por um fio condutor. O ânodo sofre oxidação (perde elétrons); o cátodo sofre redução (ganha elétrons).",
        "A <strong>pilha de Daniell</strong> (clássica) usa zinco como ânodo (Zn → Zn²⁺ + 2e⁻) e cobre como cátodo (Cu²⁺ + 2e⁻ → Cu), com potencial de célula de 1,10V. A força eletromotriz (fem) é a diferença de potencial entre os eletrodos.",
        "<strong>Baterias</strong> são pilhas recarregáveis. A bateria chumbo-ácido (carro) e a bateria de íons de lítio (celular, notebook) são as mais comuns. A pesquisa em baterias de sólido-estado e de lítio-enxofre promete revolucionar os veículos elétricos.",
        "A <strong>eletrólise</strong> é o processo inverso: usa eletricidade para forçar reações não-espontâneas. Aplicações: galvanoplastia (revestimento eletrolítico com metais preciosos), produção de alumínio (Hall-Héroult), produção de cloro e hidrogênio, purificação de cobre.",
        "A eletrólise da água é a tecnologia central do <strong>hidrogênio verde</strong> — separar H₂O em H₂ e O₂ usando eletricidade renovável. O H₂ produzido pode ser usado como combustível limpo, sem emissão de CO₂.",
      ]),
      tags: ["eletroquímica", "pilhas", "eletrólise"],
    },
  ],

  "Geografia": [
    {
      title: "Clima Brasileiro: Diversidade e Fatores Determinantes",
      body_html: makeHtml([
        "O Brasil apresenta uma das mais ricas diversidades climáticas do mundo, resultado de sua extensão territorial, relevo variado, correntes marítimas e posição em relação ao Equador e ao Trópico de Capricórnio.",
        "Os principais tipos climáticos do Brasil: <strong>Equatorial</strong> (Amazônia): quente e úmido o ano todo, temperatura média acima de 25°C, chuvas abundantes e bem distribuídas; <strong>Tropical</strong> (Cerrado e parte do Nordeste): estação seca definida; <strong>Semiárido</strong> (Sertão): baixas pluviosidades e irregulares, temperatura alta.",
        "<strong>Subtropical</strong> (Sul do Brasil): estações bem marcadas, geadas no inverno, chuvas distribuídas ao longo do ano. O estado de Santa Catarina chega a nevar esporadicamente em altitudes elevadas.",
        "Os principais fatores que influenciam o clima: <strong>latitude</strong> (distância do Equador), <strong>altitude</strong> (cada 100m de subida reduz ~0,6°C), <strong>continentalidade</strong> (distância do mar), <strong>correntes oceânicas</strong> (corrente fria das Malvinas resfria o sul do Brasil), <strong>massas de ar</strong>.",
        "O fenômeno <strong>El Niño</strong> (aquecimento anômalo do Pacífico) causa seca no Nordeste e chuvas excessivas no Sul. La Niña tem efeito oposto. Ambos amplificam extremos climáticos e causam impactos econômicos bilionários na agricultura e nos recursos hídricos.",
        "As mudanças climáticas estão intensificando eventos extremos no Brasil: secas mais prolongadas no Nordeste e Sudeste, chuvas mais intensas no Sul e eventos de calor sem precedentes. A desertificação ameaça o Semiárido e partes do Cerrado.",
      ]),
      tags: ["clima", "Brasil", "geografia física"],
    },
    {
      title: "Urbanização Brasileira: Do Campo à Metrópole",
      body_html: makeHtml([
        "Em 1940, apenas 31% dos brasileiros viviam em cidades. Em 2023, esse número ultrapassou 87%. Essa urbanização acelerada, concentrada em poucas décadas, criou tanto oportunidades quanto profundas contradições urbanas.",
        "A industrialização a partir dos anos 1950, especialmente no eixo Rio-São Paulo, foi o principal motor da urbanização. O campo se mecanizou (expulsando trabalhadores rurais) enquanto as cidades industriais atraíam com promessa de emprego e serviços.",
        "O Brasil tem um padrão urbano <strong>megalopolitano e concentrado</strong>: São Paulo (22 milhões na RMSP) e Rio de Janeiro (13 milhões) concentram riqueza, serviços e problemas. O interior e o Norte/Nordeste urbano têm cidades menores com menor infraestrutura.",
        "A urbanização acelerada sem planejamento adequado gerou: <strong>periferização</strong> (crescimento das periferias sem serviços), <strong>favelas</strong> (habitações precárias em áreas de risco), <strong>segregação socioespacial</strong>, congestionamentos, poluição e pressão sobre recursos hídricos.",
        "O conceito de <strong>metrópoles corporativas</strong> (Milton Santos) descreve como São Paulo e Rio concentram as funções de comando da economia global no Brasil, polarizando investimentos e gerando fluxos migratórios internos constantes.",
        "Cidades inteligentes (smart cities), mobilidade urbana sustentável, habitação popular de qualidade e saneamento básico universal são os grandes desafios do urbanismo brasileiro no século XXI.",
      ]),
      tags: ["urbanização", "cidades", "Brasil"],
    },
    {
      title: "Geopolítica: Os Conflitos Que Moldam o Mundo Atual",
      body_html: makeHtml([
        "Geopolítica é o estudo de como a geografia (posição, recursos, fronteiras) influencia as relações de poder entre Estados. Entender a geopolítica atual é fundamental para compreender os conflitos, as alianças e os interesses por trás das notícias.",
        "O pós-Guerra Fria criou uma <strong>ordem unipolar</strong> com os EUA como superpotência hegemônica. Essa ordem está sendo desafiada pela ascensão da China — a maior competição geopolítica do século XXI é o confronto EUA-China por hegemonia tecnológica, comercial e militar.",
        "A guerra na <strong>Ucrânia</strong> (desde 2022) é o maior conflito convencional na Europa desde a Segunda Guerra. Envolve a expansão da OTAN para leste (perspectiva ocidental) versus a segurança estratégica da Rússia (perspectiva russa). Suas consequências incluem crise energética global e reorganização das cadeias de suprimento.",
        "O <strong>Indo-Pacífico</strong> é a região mais estratégica do século XXI: o Mar do Sul da China concentra disputas territoriais entre China, Vietnam, Filipinas e outros; Taiwan é o ponto de tensão mais explosivo (China reivindica soberania; EUA garantem defesa informal).",
        "O <strong>BRICS</strong> (Brasil, Rússia, Índia, China, África do Sul + novos membros) representa uma tentativa de reequilibrar a ordem global em favor do Sul Global. A dedolarização das transações comerciais entre membros é um dos objetivos estratégicos.",
        "Para o Brasil, a geopolítica importa: posição geoestratégica na América do Sul, recursos naturais cobiçados (Pré-sal, Aquífero Guarani, biodiversidade), participação em blocos como Mercosul e BRICS, e papel potencial como mediador em conflitos internacionais.",
      ]),
      tags: ["geopolítica", "relações internacionais", "conflitos"],
    },
    {
      title: "Recursos Hídricos: A Crise da Água no Século XXI",
      body_html: makeHtml([
        "A água doce é um recurso finito e desigualmente distribuído. Embora cubra 70% da superfície terrestre, apenas 2,5% é doce, e apenas 0,3% está em rios e lagos acessíveis. No século XXI, a escassez hídrica é um dos maiores desafios globais.",
        "O Brasil detém cerca de 12% da água doce superficial do planeta, com o rio Amazonas transportando 20% de toda a água doce que chega ao oceano. Paradoxalmente, o Nordeste semiárido convive com a pior seca do país — distribuição interna desequilibrada.",
        "As principais bacias hidrográficas brasileiras: <strong>Amazônica</strong> (maior do mundo em volume), <strong>Platina</strong> (Paraná, Paraguai, Uruguai — base da hidroeletricidade do Sudeste), <strong>São Francisco</strong> ('rio da integração nacional', fundamental para o Nordeste).",
        "A <strong>Transposição do Rio São Francisco</strong>, obra concluída em 2017, leva água para o semiárido de Ceará, Paraíba, Pernambuco e Rio Grande do Norte. É uma das maiores obras hídricas da história brasileira — mas também uma das mais controversas.",
        "Causas da crise hídrica: desmatamento (reduz a recarga dos aquíferos), poluição, uso agrícola intensivo (70% do consumo de água é para irrigação), desperdício (perdas de 30-40% na rede urbana), e mudanças climáticas que intensificam secas e enchentes.",
        "Soluções: eficiência no uso agrícola (irrigação por gotejamento), reuso de água tratada, proteção das matas ciliares, dessalinização da água do mar (viável para o litoral nordestino) e governança integrada por bacias hidrográficas.",
      ]),
      tags: ["recursos hídricos", "água", "Brasil"],
    },
    {
      title: "Globalização: Oportunidades e Contradições",
      body_html: makeHtml([
        "Globalização é o processo de integração econômica, cultural e política entre países e regiões, acelerado a partir dos anos 1970-80 com a revolução das telecomunicações, a liberalização comercial e a financeirização da economia.",
        "No plano <strong>econômico</strong>, a globalização resultou em cadeias produtivas globais (o iPhone é projetado nos EUA, com componentes do Japão, Taiwan e Coreia, montado na China). Países como China e Coreia do Sul se beneficiaram enormemente — mas a desindustrialização atingiu trabalhadores dos países desenvolvidos.",
        "No plano <strong>cultural</strong>, temos paradoxos: homogeneização (fast food, streaming, redes sociais globais) convive com revalorização das identidades locais e com a 'glocalização' (adaptação do global ao local). K-pop, gastronomia regional e artesanato são resistências à uniformização.",
        "A globalização financeira criou um mercado de capitais integrado e 24h — mas também instabilidade: crises como a de 2008 (EUA) se propagam instantaneamente para o mundo todo.",
        "<strong>Desglobalização</strong> e reshoring (trazer de volta produção terceirizada) são tendências recentes, aceleradas pela pandemia de COVID-19 e pelas tensões EUA-China. O 'nearshoring' (produção em países próximos) está reconfigurando as cadeias produtivas.",
        "Para o Brasil, a globalização traz oportunidades (commodities agrícolas e minerais têm demanda global crescente) e riscos (dependência de preços internacionais, vulnerabilidade cambial, desindustrialização). A questão é como se inserir de forma soberana na economia globalizada.",
      ]),
      tags: ["globalização", "economia", "geografia"],
    },
  ],

  "Filosofia": [
    {
      title: "Sócrates e o Método Socrático: A Arte de Perguntar",
      body_html: makeHtml([
        "Sócrates (469-399 a.C.) não deixou nada escrito — conhecemos seu pensamento através dos diálogos de Platão. Mas sua influência sobre o pensamento ocidental é incalculável. Ele redirecionou a filosofia grega da natureza para o ser humano.",
        "O famoso 'Conhece-te a ti mesmo' (gnôthi seautón), inscrito no Oráculo de Delfos, resume o projeto socrático: a filosofia começa com a autoconsciência, com o exame crítico de si mesmo e de suas crenças.",
        "O <strong>método socrático</strong> (maiêutica e elenco) consiste em fazer perguntas aparentemente simples para revelar as contradições do interlocutor. Sócrates dizia ser como uma parteira: não tinha respostas, mas ajudava os outros a 'dar à luz' suas próprias verdades.",
        "Sócrates foi condenado à morte em 399 a.C. por 'corromper a juventude' e 'introduzir novos deuses'. Recusou a fuga oferecida pelos amigos, escolhendo a morte para ser coerente com seus princípios sobre as leis e a cidade.",
        "A ironia socrática ('só sei que nada sei') não é niilismo — é a consciência de que o verdadeiro saber começa pelo reconhecimento da ignorância. O filósofo que crê saber tudo fecha-se ao aprendizado.",
        "O legado socrático é o do pensamento crítico como valor em si mesmo. Em uma época de fake news e dogmatismo, a postura socrática de questionar, examinar e não aceitar o senso comum sem reflexão é mais necessária do que nunca.",
      ]),
      tags: ["Sócrates", "filosofia grega", "pensamento crítico"],
    },
    {
      title: "Ética: O Que é Agir Corretamente?",
      body_html: makeHtml([
        "A ética é o ramo da filosofia que investiga como devemos agir, o que é certo e errado, bom e mau. Ao contrário do que muitos pensam, não é um catálogo de regras — é uma reflexão racional sobre os fundamentos da moralidade.",
        "A <strong>ética deontológica</strong> de Kant afirma que a moralidade se baseia no dever (deontologia = estudo do dever). O imperativo categórico: 'Age apenas segundo aquela máxima que possas ao mesmo tempo querer que se torne lei universal'. O critério é a universalizabilidade, não as consequências.",
        "O <strong>utilitarismo</strong> (Bentham, Mill) julga as ações por suas consequências: é certo aquilo que maximiza a felicidade (bem-estar) do maior número de pessoas. É uma ética consequencialista — o fim pode justificar os meios, se os meios produzirem mais bem que mal.",
        "A <strong>ética das virtudes</strong> (Aristóteles) foca no caráter moral: ser ético é cultivar virtudes como coragem, prudência, justiça, temperança. As virtudes são hábitos adquiridos pela prática — a excelência moral se aprende vivendo.",
        "Dilemas éticos contemporâneos: eutanásia, experimentos com embriões, inteligência artificial, distribuição de vacinas em escassez, reparação histórica por injustiças passadas. Cada um ilumina tensões entre diferentes marcos éticos.",
        "A distinção entre ética e moral é útil: <strong>moral</strong> é o conjunto de normas de uma sociedade específica (costumes, tradições); <strong>ética</strong> é a reflexão filosófica crítica sobre essas normas — ela pode questionar e reformar a moral.",
      ]),
      tags: ["ética", "moral", "filosofia"],
    },
    {
      title: "Existencialismo: Sartre e a Liberdade Radical",
      body_html: makeHtml([
        "O existencialismo é a corrente filosófica do século XX que coloca a existência humana concreta, individual e angustiada no centro da reflexão filosófica. Em reação ao idealismo abstrato, existencialistas perguntam: o que significa existir como ser humano?",
        "Jean-Paul Sartre enunciou a tese central: '<strong>A existência precede a essência</strong>'. Ao contrário de uma faca (criada com uma função prévia), o ser humano existe primeiro e define sua essência através de suas escolhas. Não há natureza humana fixa — somos o que fazemos.",
        "Isso implica <strong>liberdade radical</strong>: somos 'condenados a ser livres'. Não podemos escapar da responsabilidade pelas nossas escolhas — mesmo a recusa de escolher é uma escolha. A 'má-fé' (mauvaise foi) é a auto-enganação que nos faz agir como se não tivéssemos escolha.",
        "Simone de Beauvoir aplicou o existencialismo ao feminismo: em 'O Segundo Sexo', argumenta que 'não se nasce mulher, torna-se mulher'. A feminilidade é uma construção social — o existencialismo fundamenta filosoficamente a luta pela emancipação feminina.",
        "Albert Camus, embora se recusasse ao rótulo de existencialista, explorou o <strong>absurdo</strong>: a tensão entre o desejo humano de sentido e o silêncio indiferente do universo. A resposta não é o suicídio (escapismo) mas a revolta — viver plenamente apesar do absurdo.",
        "O existencialismo ainda ressoa: em uma era de crise de sentido, polarização e alienação digital, a ênfase na responsabilidade individual, na autenticidade e na criação de sentido é urgente.",
      ]),
      tags: ["existencialismo", "Sartre", "filosofia moderna"],
    },
    {
      title: "Filosofia Política: Estado, Contrato e Justiça",
      body_html: makeHtml([
        "A filosofia política investiga as fundações do poder, da obrigação política e da justiça. Por que devemos obedecer ao Estado? O que torna um governo legítimo? O que é uma sociedade justa? São questões que interessam a qualquer cidadão.",
        "Os contratualistas do séc. XVII-XVIII imaginaram um 'estado de natureza' para fundamentar o Estado. Para <strong>Hobbes</strong>, sem Estado, a vida seria 'solitária, pobre, sórdida, brutal e curta' — daí a necessidade de um soberano absoluto (Leviatã). Para <strong>Locke</strong>, o estado de natureza é de relativa paz; o Estado serve para proteger vida, liberdade e propriedade.",
        "<strong>Rousseau</strong> inverteu Hobbes: o homem natural é bom; é a sociedade que o corrompe. O contrato social deve expressar a 'vontade geral' (o bem comum), não a soma de interesses individuais. Base filosófica das democracias republicanas.",
        "<strong>John Rawls</strong> (séc. XX) propôs o 'véu da ignorância': imagine que você vai escolher as regras de uma sociedade sem saber qual posição vai ocupar nela (rico ou pobre, homem ou mulher). Você escolheria princípios justos — incluindo proteger os mais vulneráveis. É a base do liberalismo igualitário.",
        "A crítica comunitarista (Sandel, MacIntyre) questiona o indivíduo abstrato do liberalismo: somos seres situados em comunidades, tradições e histórias que constituem nossa identidade. A justiça não pode ignorar esses contextos.",
        "As questões de filosofia política contemporânea são urgentes: democracia representativa em crise, desinformação e populismo, desigualdade crescente, direitos das minorias, redistribuição vs. liberdade. A filosofia não dá respostas prontas — mas fornece as ferramentas para pensar com clareza.",
      ]),
      tags: ["filosofia política", "democracia", "justiça"],
    },
    {
      title: "Platão e a Teoria das Ideias",
      body_html: makeHtml([
        "Platão (427-347 a.C.), discípulo de Sócrates e mestre de Aristóteles, é o mais influente filósofo do Ocidente. Alfred North Whitehead disse que 'toda a filosofia ocidental é uma série de notas de rodapé a Platão'.",
        "A <strong>Teoria das Ideias</strong> (ou Formas) é o coração do platonismo. Platão distingue dois mundos: o mundo sensível (das coisas materiais, mutáveis e imperfeitas) e o mundo inteligível (das Ideias eternas, imutáveis e perfeitas). Uma cadeira concreta é uma cópia imperfeita da Ideia de Cadeira.",
        "O conhecimento verdadeiro (episteme) é a apreensão intelectual das Ideias, não a percepção sensorial (que produz apenas opinião, doxa). O filósofo é quem ascende do mundo das sombras ao mundo da luz — daí a Alegoria da Caverna.",
        "A <strong>Alegoria da Caverna</strong> (República, Livro VII): prisioneiros acorrentados em uma caverna veem apenas sombras na parede e acreditam ser a realidade. O filósofo que se liberta, sobe e vê o sol (Ideia do Bem) tem o dever de retornar e libertar os outros.",
        "Na <strong>República</strong>, Platão propõe o governo dos filósofos-reis: só quem conhece o Bem pode governar justamente. A cidade ideal é dividida em produtores, guardiões e filósofos-governantes, correspondendo às três partes da alma.",
        "O platonismo influenciou o Neoplatonismo, o Agostinismo e, via esses, toda a teologia cristã medieval. A ideia de um mundo transcendente, mais real que o material, moldou a civilização ocidental de forma profunda.",
      ]),
      tags: ["Platão", "filosofia grega", "teoria das ideias"],
    },
  ],

  "Inglês": [
    {
      title: "Present Perfect vs Simple Past: Never Confuse Them Again",
      body_html: makeHtml([
        "One of the most common mistakes Brazilian students make in English is mixing up the Present Perfect and the Simple Past. They seem similar, but they communicate very different things.",
        "The <strong>Simple Past</strong> describes completed actions at a specific time in the past. The time reference is either stated or clearly implied. Examples: 'I watched that film yesterday'; 'She graduated in 2020'; 'We met at a conference last year.'",
        "The <strong>Present Perfect</strong> connects the past to the present. It's used for: 1) experiences without a specific time ('I have visited Paris' — at some point in my life); 2) recent actions with present relevance ('She has just arrived'); 3) unfinished time periods ('I have studied English for 5 years' — and still do).",
        "The key question: <em>Is the time specific and finished?</em> If yes → Simple Past. If the action has a connection to now → Present Perfect. 'I saw him' (at some point, finished). 'I have seen him today' (today is not over yet).",
        "Common triggers: <strong>Simple Past</strong>: yesterday, last week, in 2010, ago, when, then. <strong>Present Perfect</strong>: just, already, yet, ever, never, since, for, recently, so far, this week/month/year.",
        "Practice: correct these sentences. 'I have eaten sushi yesterday' → 'I ate sushi yesterday'. 'Did you ever try skydiving?' → 'Have you ever tried skydiving?' Getting this right will make your English sound much more natural.",
      ]),
      tags: ["grammar", "tenses", "English"],
    },
    {
      title: "Modal Verbs: The Complete Guide to Can, Could, Should, Would",
      body_html: makeHtml([
        "Modal verbs are auxiliary verbs that express ability, possibility, permission, obligation, and advice. They are followed by the base form of the main verb (infinitive without 'to') and do not change form for different subjects.",
        "<strong>CAN / COULD:</strong> Can = present ability or possibility ('I can speak Portuguese'). Could = past ability ('As a child, I could run very fast') or polite request ('Could you help me?') or weaker possibility ('It could rain tomorrow').",
        "<strong>SHOULD / OUGHT TO:</strong> Used for advice and recommendations. 'You should see a doctor' (I think it's a good idea). 'You shouldn't smoke' (it's bad for you). Ought to is slightly more formal but has the same meaning.",
        "<strong>WOULD:</strong> Used for conditional sentences ('I would travel more if I had money'), polite requests ('Would you mind closing the window?'), and past habits ('When I was young, I would play outside every day').",
        "<strong>MUST / HAVE TO:</strong> Both express obligation, but with a nuance. Must = personal obligation, internal ('I must study harder'). Have to = external obligation, a rule ('You have to wear a seatbelt'). Mustn't = forbidden. Don't have to = not necessary.",
        "<strong>MAY / MIGHT:</strong> Both express possibility. May = slightly more certain ('It may rain'). Might = less certain ('It might rain'). May also expresses formal permission ('May I leave early today?'). Master these and you'll communicate with precision and nuance.",
      ]),
      tags: ["modals", "grammar", "English"],
    },
    {
      title: "Phrasal Verbs: The Secret to Natural English",
      body_html: makeHtml([
        "Phrasal verbs — combinations of a verb + preposition/adverb particle — are one of the most challenging aspects of English for non-native speakers. Yet they are everywhere in natural conversation. Understanding them will transform your fluency.",
        "Unlike formal vocabulary, phrasal verbs are informal and conversational. Native speakers say 'give up' (not 'abandon'), 'find out' (not 'discover'), 'turn down' (not 'refuse'). If you only use formal vocabulary, you'll sound unnatural.",
        "Essential phrasal verbs for daily use: <strong>put off</strong> (postpone: 'Don't put off your homework'); <strong>give up</strong> (stop trying: 'Never give up on your dreams'); <strong>look up</strong> (search for information: 'Look it up on Google'); <strong>bring up</strong> (raise a topic: 'She brought up an interesting point').",
        "More essential ones: <strong>run into</strong> (meet unexpectedly: 'I ran into an old friend'); <strong>come across</strong> (find accidentally or give an impression: 'She comes across as very confident'); <strong>get along</strong> (have a good relationship: 'Do you get along with your coworkers?').",
        "Some phrasal verbs are separable (the object can go between verb and particle): 'Turn the music down' = 'Turn down the music'. Others are inseparable: 'I came across a great book' (NOT 'I came a great book across').",
        "The best way to learn phrasal verbs: don't memorize lists in isolation. Learn them in context — through series, movies, podcasts and conversations. When you encounter one, note it down with its context and example sentence.",
      ]),
      tags: ["phrasal verbs", "vocabulary", "English"],
    },
    {
      title: "Writing Essays in English: Structure and Key Strategies",
      body_html: makeHtml([
        "Writing a well-structured essay in English is a skill that opens doors — to universities, international careers and academic publications. The good news: the structure is clear and learnable.",
        "The classic 5-paragraph essay structure: <strong>Introduction</strong> (hook + background + thesis statement), <strong>Body Paragraph 1</strong> (topic sentence + evidence + analysis), <strong>Body Paragraph 2</strong>, <strong>Body Paragraph 3</strong>, <strong>Conclusion</strong> (restate thesis + summary + final thought).",
        "The <strong>thesis statement</strong> is the most important sentence in your essay — it states your main argument clearly and specifically. Weak: 'Social media has effects on teenagers.' Strong: 'Excessive social media use significantly impairs adolescents' mental health by fostering social comparison and disrupting sleep patterns.'",
        "Each body paragraph needs a clear <strong>topic sentence</strong> that supports your thesis. Then provide evidence (data, quotes, examples) and explain HOW that evidence supports your argument. The PIE structure helps: Point → Illustration → Explanation.",
        "Transitions are crucial for coherence. First, Furthermore, However, As a result, In contrast, In conclusion... Use them to signal the relationship between ideas, not just to fill space.",
        "Common mistakes to avoid: 1) Starting sentences with 'I think' or 'I believe' (show your argument, don't announce it); 2) Using very informal vocabulary; 3) Presenting only one side without acknowledging counterarguments; 4) A conclusion that simply repeats the introduction word-for-word.",
      ]),
      tags: ["writing", "academic English", "essays"],
    },
    {
      title: "Reading Comprehension: Strategies for Difficult Texts",
      body_html: makeHtml([
        "Reading comprehension in English goes far beyond knowing vocabulary. It requires understanding the author's purpose, recognizing implicit meanings and evaluating arguments. These strategies will make you a much more effective reader.",
        "<strong>Skimming</strong>: reading quickly to get the main idea. Read the title, subtitles, first and last paragraphs and the first sentence of each paragraph. This gives you the 'map' of the text before reading in depth.",
        "<strong>Scanning</strong>: reading to find specific information. You know what you're looking for (a date, a name, a number) and move your eyes quickly until you find it. Essential for exams.",
        "Dealing with unknown vocabulary: <strong>context clues</strong> are your best friend. Look at the surrounding sentences. 'The politician's obfuscating language confused voters' — even without knowing 'obfuscate', you can infer it means something like 'confusing or unclear'.",
        "Identifying the author's <strong>tone and purpose</strong>: Is the text informative, persuasive, critical, satirical? What point of view does the author take? What assumptions does she make? Critical reading means questioning, not just absorbing.",
        "Active reading strategies: annotate as you read (underline key phrases, write questions in the margin); summarize each paragraph in one sentence; after reading, try to explain the text to someone else without looking — the 'Feynman technique' is the best test of real comprehension.",
      ]),
      tags: ["reading", "comprehension", "English"],
    },
    {
      title: "Common Mistakes Brazilians Make in English (And How to Fix Them)",
      body_html: makeHtml([
        "Every language learner makes mistakes influenced by their native language. Knowing the most common interference errors between Portuguese and English helps you avoid them — and learn faster.",
        "<strong>'I am agree'</strong> — WRONG. The verb 'agree' is a main verb, not an adjective: 'I agree' (not 'I am agree'). Similarly: 'I am disagree' → 'I disagree'. Interference from Portuguese 'Estou de acordo'.",
        "<strong>Make vs Do:</strong> 'Make a mistake' (not 'do a mistake'); 'Do your homework' (not 'make your homework'); 'Make a decision'; 'Do sports'. There's no perfect logical rule — these collocations must be memorized.",
        "<strong>Preposition after verbs:</strong> 'Depend ON' (not 'depend of'); 'Wait FOR' (not 'wait to'); 'Listen TO' (not 'listen'); 'Arrive IN a city' / 'Arrive AT a specific place'.",
        "<strong>Countable vs uncountable nouns:</strong> 'Information' is uncountable in English — 'an information' is WRONG. Say 'a piece of information' or 'some information'. Same for 'advice', 'luggage', 'furniture', 'news'.",
        "<strong>False cognates</strong> (false friends): 'Actually' means 'currently' or 'in fact', NOT 'atualmente' (which is 'currently/nowadays'). 'Pretend' means 'fingir', not 'pretender'. 'Push' is 'empurrar', not 'puxar'. Learning these will save you from embarrassing misunderstandings!",
      ]),
      tags: ["mistakes", "grammar", "English learning"],
    },
  ],

  "Artes": [
    {
      title: "História da Arte: Do Renascimento ao Impressionismo",
      body_html: makeHtml([
        "A história da arte ocidental é uma conversa de séculos entre artistas, cada geração respondendo, rejeitando ou ampliando o legado das anteriores. Conhecer essa trajetória nos dá ferramentas para entender qualquer obra.",
        "O <strong>Renascimento</strong> (sécs. XV-XVI, Itália) redescobriu a Antiguidade greco-romana e colocou o humano no centro. Leonardo da Vinci, Miguel Ângelo e Rafael dominaram a perspectiva, o sfumato e a idealização do corpo humano. A Sistina e a Mona Lisa são seus ícones.",
        "O <strong>Barroco</strong> (séc. XVII) foi a arte da Contrarreforma — dramático, emocional, com uso intenso de luz e sombra (chiaroscuro). Caravaggio chocou com sua iluminação teatral e figuras populares como modelos sagrados. Bernini esculpiu mármore como se fosse pele.",
        "O <strong>Neoclassicismo</strong> (séc. XVIII) voltou às formas clássicas gregas e romanas, inspirado pelas escavações de Pompeia e pelo racionalismo iluminista. David pintou heróis romanos como modelos cívicos para a Revolução Francesa.",
        "O <strong>Romantismo</strong> (séc. XIX) reagiu ao racionalismo iluminista com emoção, natureza selvagem e nacionalismo. Delacroix, Turner e Caspar David Friedrich celebraram o sublime — a imensidão esmagadora da natureza diante do humano.",
        "O <strong>Impressionismo</strong> (a partir de 1860) rompeu com a academia: Monet, Renoir e Degas pintaram ao ar livre, capturando a luz fugaz do momento com pinceladas rápidas e cores vibrantes. 'Impressão: Nascer do Sol' deu nome ao movimento — e escandalizou o establishment artístico da época.",
      ]),
      tags: ["história da arte", "pintura", "arte ocidental"],
    },
    {
      title: "Arte Brasileira: Do Modernismo à Arte Contemporânea",
      body_html: makeHtml([
        "A arte brasileira trilhou um caminho de busca pela identidade própria, oscilando entre a assimilação das vanguardas europeias e a afirmação de uma expressão genuinamente nacional.",
        "O <strong>período colonial</strong> produziu um barroco único: o Aleijadinho (Antônio Francisco Lisboa) criou em Minas Gerais uma escultura que fundiu tradição europeia com sensibilidade local. Os profetas do Santuário do Bom Jesus de Matosinhos em Congonhas são obras-primas mundiais.",
        "A <strong>Missão Artística Francesa</strong> (1816) trouxe o neoclassicismo e fundou a Academia Imperial de Belas Artes no Rio. Por décadas, a arte 'oficial' brasileira seria europeia nos temas e na técnica — Pedro Américo e Victor Meirelles pintaram a história nacional com ambição épica.",
        "A <strong>Semana de Arte Moderna de 1922</strong> foi o divisor de águas. Tarsila do Amaral, com sua série 'Pau-Brasil' e 'Antropofágica', criou imagens que fundem o primitivo brasileiro com o cubismo europeu. 'Abaporu' (1928) tornou-se a pintura brasileira mais cara já vendida.",
        "Nos anos 1960-70, o <strong>tropicalismo</strong> de Hélio Oiticica e Lygia Clark expandiu os limites da arte: participação do espectador, instalações, happenings. Oiticica distribuiu capas (Parangolés) em sambistas do Mangueira — a arte saiu do museu e foi para a rua.",
        "A <strong>Arte Contemporânea brasileira</strong> tem presença global: Cildo Meireles (instalações políticas), Vik Muniz (retratos feitos com materiais inusitados), OSGEMEOS (graffiti de repercussão mundial). O Brasil é hoje um dos centros mais vibrantes da arte contemporânea.",
      ]),
      tags: ["arte brasileira", "modernismo", "arte contemporânea"],
    },
    {
      title: "Fundamentos da Linguagem Visual: Cor, Forma e Composição",
      body_html: makeHtml([
        "Assim como a linguagem verbal tem gramática, a linguagem visual tem elementos e princípios que orientam a comunicação visual — seja em uma pintura, um cartaz, um site ou uma fotografia.",
        "<strong>Cor</strong>: o círculo cromático organiza as cores primárias (azul, vermelho, amarelo), secundárias e terciárias. Cores complementares (opostas no círculo) criam contraste máximo; cores análogas (vizinhas) criam harmonia. A temperatura das cores (quentes: vermelho, laranja, amarelo; frias: azul, verde, roxo) influencia emocionalmente o espectador.",
        "<strong>Forma e linha:</strong> linhas horizontais sugerem calma e estabilidade; verticais sugerem força e elevação; diagonais criam movimento e tensão; curvas evocam suavidade e organicidade. Formas geométricas comunicam ordem e racionalidade; formas orgânicas comunicam natureza e emoção.",
        "<strong>Composição</strong> é a organização dos elementos no espaço visual. A <em>regra dos terços</em> divide a imagem em uma grade 3x3 — os pontos de interseção são os mais poderosos para posicionar elementos principais. O <em>equilíbrio</em> pode ser simétrico (formal, estável) ou assimétrico (dinâmico, moderno).",
        "<strong>Contraste, ritmo e unidade:</strong> contraste cria interesse e hierarquia visual; ritmo é a repetição de elementos que cria movimento (como o padrão em uma faixa); unidade é a coesão que faz os elementos funcionarem como um todo, não como peças isoladas.",
        "Exercício prático: escolha uma publicidade ou capa de revista. Identifique: que cores foram escolhidas e por quê? Onde está posicionado o elemento principal? Que emoção a composição transmite? Esse olhar analítico transforma você de consumidor passivo em leitor ativo das imagens.",
      ]),
      tags: ["linguagem visual", "design", "artes visuais"],
    },
    {
      title: "Música Brasileira: Raízes e Identidade",
      body_html: makeHtml([
        "A música brasileira é uma das mais ricas e originais do mundo, resultado da fusão de influências indígenas, africanas e europeias, moldadas por uma história e uma geografia únicas.",
        "O <strong>samba</strong> surgiu no Rio de Janeiro no início do século XX, a partir das rodas de lundum e maxixe dos negros baianos que migraram para a capital. A fundação da primeira escola de samba (Deixa Falar, 1928) institucionalizou o gênero. Cartola, Nelson Cavaquinho e Clara Nunes elevaram o samba a arte.",
        "A <strong>Bossa Nova</strong> (fim dos anos 1950) foi uma revolução quieta: João Gilberto, Tom Jobim e Vinícius de Moraes criaram uma música sofisticada, com harmonias jazzísticas, letras poéticas e a sincopação contida do violão-gago. 'Garota de Ipanema' tornou-se uma das músicas mais gravadas da história.",
        "A <strong>MPB</strong> surgiu nos anos 1960 como categoria guarda-chuva da música brasileira de qualidade: Caetano Veloso, Gilberto Gil, Chico Buarque, Milton Nascimento. O tropicalismo de Caetano e Gil absorveu rock, Beatles e experimentalismo sem perder a alma brasileira.",
        "O <strong>forró</strong> (Luiz Gonzaga, 'Rei do Baião'), o <strong>axé</strong>, o <strong>funk carioca</strong> e o mais recente <strong>pagode baiano</strong> e <strong>sertanejo universitário</strong> mostram que a música brasileira continua se renovando, dialogando com tradições regionais e influências globais.",
        "Entender a música brasileira é entender o Brasil: suas origens africanas, sua miscigenação, suas contradições sociais e sua alegria resiliente. Cada ritmo carrega uma história, uma região, uma forma de sentir o mundo.",
      ]),
      tags: ["música brasileira", "samba", "MPB"],
    },
    {
      title: "Fotografia: Técnica e Olhar Artístico",
      body_html: makeHtml([
        "A fotografia, inventada em 1839, transformou radicalmente a relação da humanidade com o tempo, a memória e a realidade. Mais do que uma técnica, é uma forma de ver o mundo — um olhar que recorta, enquadra e interpreta.",
        "A <strong>exposição</strong> é determinada por três variáveis: <strong>abertura</strong> do diafragma (f/1,8; f/11...) controla a quantidade de luz e a profundidade de campo; <strong>velocidade do obturador</strong> controla o tempo de exposição (congela ou cria borrão de movimento); <strong>ISO</strong> é a sensibilidade do sensor (ISO alto = mais sensível, mas mais ruído/grão).",
        "O <strong>triângulo de exposição</strong>: as três variáveis se equilibram. Para congelar um atleta em movimento, use alta velocidade (1/1000s) + abertura ampla (f/2,8) + ISO adequado. Para fotografia noturna sem tripé, suba o ISO e abra o diafragma.",
        "A <strong>composição</strong> transforma uma foto técnica em arte. Além da regra dos terços: a <em>linha do horizonte</em> (nunca no centro, salvo propositalmente); os <em>elementos de primeiro plano</em> que criam profundidade; as <em>linhas condutoras</em> que guiam o olhar; o <em>espaço negativo</em> que dá respiro à imagem.",
        "<strong>Luz</strong> é a essência da fotografia (o nome vem do grego: 'escrever com luz'). A <em>hora dourada</em> (1h após o amanhecer e 1h antes do pôr do sol) oferece luz quente, lateral e suave — ideal para retratos e paisagens. A <em>hora azul</em> (crepúsculo) cria atmosferas únicas.",
        "A fotografia documental de Sebastião Salgado, a street photography de Henri Cartier-Bresson, os retratos de Dorothea Lange durante a Grande Depressão — essas obras mostram que a fotografia pode ser instrumento de arte, jornalismo e transformação social simultaneamente.",
      ]),
      tags: ["fotografia", "técnica", "arte visual"],
    },
  ],
}

// ─── Funções de inserção ───────────────────────────────────────────────────────

async function insertProfessor(client, professor) {
  const userId = randomUUID()

  await client.query(
    `INSERT INTO public.users (id, email, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (email) DO NOTHING`,
    [userId, professor.email, PASSWORD_HASH]
  )

  const userRow = await client.query(
    `SELECT id FROM public.users WHERE email = $1`,
    [professor.email]
  )
  const finalUserId = userRow.rows[0]?.id
  if (!finalUserId) throw new Error(`Usuário não encontrado: ${professor.email}`)

  await client.query(
    `INSERT INTO public.profiles
       (id, full_name, user_type, bio, interests, professor_verification_status, created_at, updated_at)
     VALUES ($1, $2, 'professor', $3, $4, 'approved', NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       professor_verification_status = 'approved',
       bio = EXCLUDED.bio,
       interests = EXCLUDED.interests`,
    [finalUserId, professor.fullName, professor.bio, professor.interests]
  )

  return finalUserId
}

async function insertPosts(client, userId, area) {
  const posts = postsByArea[area]
  if (!posts) {
    console.warn(`  Nenhum post para área: ${area}`)
    return 0
  }

  let count = 0
  for (const post of posts) {
    const settings = {
      tags: post.tags,
      disciplina: area.toLowerCase(),
    }

    await client.query(
      `INSERT INTO public.content_items
         (id, author_id, type, title, body_html, status, visibility, settings, like_count, share_count, comment_count, view_count, published_at, created_at, updated_at)
       VALUES ($1, $2, 'article', $3, $4, 'published', 'public', $5, $6, $7, $8, $9, NOW() - INTERVAL '${Math.floor(Math.random() * 30)} days', NOW(), NOW())`,
      [
        randomUUID(),
        userId,
        post.title,
        post.body_html,
        JSON.stringify(settings),
        Math.floor(Math.random() * 120) + 10,
        Math.floor(Math.random() * 40) + 2,
        Math.floor(Math.random() * 15),
        Math.floor(Math.random() * 300) + 50,
      ]
    )
    count++
  }
  return count
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const client = await pool.connect()
try {
  await client.query("BEGIN")

  for (const professor of professors) {
    process.stdout.write(`Criando ${professor.fullName} (${professor.area})... `)
    const userId = await insertProfessor(client, professor)
    const postCount = await insertPosts(client, userId, professor.area)
    console.log(`✓ ${postCount} posts`)
  }

  await client.query("COMMIT")
  console.log(`\n✅ Seed concluído: ${professors.length} professores criados com sucesso!`)
  console.log(`\nSenha padrão de todos: Professor@123`)
  console.log(`\nProfessores criados:`)
  professors.forEach(p => console.log(`  ${p.area.padEnd(20)} ${p.email}`))
} catch (err) {
  await client.query("ROLLBACK")
  console.error("\n❌ Erro no seed:", err.message)
  throw err
} finally {
  client.release()
  await pool.end()
}
