import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Política de Privacidade | EduConnect",
  description:
    "Como a EduConnect coleta, usa, compartilha e protege os dados pessoais, em conformidade com a LGPD.",
}

const LAST_UPDATE = "16 de junho de 2026"

export default function PrivacidadePage() {
  return (
    <>
      <h1>Política de Privacidade</h1>
      <p className="text-sm text-gray-500">Última atualização: {LAST_UPDATE}</p>

      <div className="my-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>Aviso:</strong> este documento é um modelo inicial e deve ser revisado por um
        advogado e ajustado com os dados da empresa controladora antes do lançamento público.
        Campos entre colchetes <code>[ ]</code> precisam ser preenchidos.
      </div>

      <p>
        A EduConnect (&ldquo;<strong>nós</strong>&rdquo;, &ldquo;<strong>plataforma</strong>&rdquo;)
        leva a sua privacidade a sério. Esta Política explica como tratamos seus dados pessoais, em
        conformidade com a Lei nº 13.709/2018 (<strong>LGPD</strong>).
      </p>

      <h2>1. Controladora dos dados</h2>
      <p>
        O controlador dos dados é <strong>[NOME DA EMPRESA / RAZÃO SOCIAL]</strong>, inscrita no CNPJ
        sob nº <strong>[CNPJ]</strong>, com sede em <strong>[ENDEREÇO, CIDADE/UF]</strong>.
        Encarregado(a) pelo Tratamento de Dados (DPO): <strong>[NOME]</strong>, contato:{" "}
        <a href="mailto:privacidade@educonnect.com.br">[privacidade@educonnect.com.br]</a>.
      </p>

      <h2>2. Dados que coletamos</h2>
      <ul>
        <li><strong>Cadastro:</strong> nome, e-mail, senha (armazenada com hash), tipo de conta (aluno/professor), data de nascimento e interesses/disciplinas.</li>
        <li><strong>Perfil:</strong> biografia, foto, capa, link público e demais informações que você opta por preencher.</li>
        <li><strong>Verificação de professor:</strong> documento enviado para comprovação de identidade profissional.</li>
        <li><strong>Conteúdo e uso:</strong> conteúdos publicados, turmas, atividades, submissões, comentários, curtidas e itens salvos.</li>
        <li><strong>Login social:</strong> ao usar o Google, recebemos seu e-mail, nome e foto pública.</li>
        <li><strong>Dados técnicos:</strong> endereço IP, tipo de navegador e dados de uso agregados para segurança e métricas.</li>
      </ul>

      <h2>3. Finalidades e base legal</h2>
      <ul>
        <li><strong>Operar a conta e a plataforma</strong> — execução de contrato (Art. 7º, V).</li>
        <li><strong>Verificar professores</strong> — legítimo interesse na qualidade e segurança (Art. 7º, IX).</li>
        <li><strong>Moderar conteúdo</strong> — legítimo interesse e proteção dos usuários.</li>
        <li><strong>Comunicações transacionais</strong> (recuperação de senha, avisos) — execução de contrato.</li>
        <li><strong>Segurança e prevenção a fraudes</strong> — cumprimento de obrigação e legítimo interesse.</li>
        <li><strong>Melhoria do produto</strong> (métricas agregadas) — legítimo interesse, com consentimento quando exigido.</li>
      </ul>

      <h2>4. Compartilhamento e operadores</h2>
      <p>Não vendemos seus dados. Compartilhamos apenas com operadores que viabilizam o serviço:</p>
      <ul>
        <li><strong>Vercel</strong> — hospedagem, armazenamento de arquivos e métricas.</li>
        <li><strong>Resend</strong> — envio de e-mails transacionais.</li>
        <li><strong>Google</strong> — autenticação (quando você usa o login social).</li>
        <li><strong>xAI</strong> — análise automatizada (moderação) de conteúdo publicado.</li>
        <li><strong>OpenAI</strong> — análise automatizada do documento de verificação de professor.</li>
      </ul>
      <p>
        Parte desses serviços pode tratar dados fora do Brasil. Adotamos salvaguardas para a
        transferência internacional conforme a LGPD (Art. 33).
      </p>

      <h2>5. Retenção</h2>
      <p>
        Mantemos seus dados enquanto sua conta estiver ativa e pelo período necessário para cumprir
        obrigações legais. Após a exclusão da conta, os dados são apagados ou anonimizados, salvo
        quando a lei exigir guarda por prazo determinado.
      </p>

      <h2>6. Seus direitos (Art. 18 da LGPD)</h2>
      <p>Você pode, a qualquer momento, solicitar:</p>
      <ul>
        <li>confirmação da existência de tratamento e acesso aos dados;</li>
        <li>correção de dados incompletos ou desatualizados;</li>
        <li>anonimização, bloqueio ou eliminação de dados desnecessários;</li>
        <li>portabilidade e informação sobre compartilhamentos;</li>
        <li>revogação do consentimento e eliminação dos dados tratados com base nele.</li>
      </ul>
      <p>
        Para exercer seus direitos, escreva para{" "}
        <a href="mailto:privacidade@educonnect.com.br">[privacidade@educonnect.com.br]</a>.
      </p>

      <h2>7. Crianças e adolescentes</h2>
      <p>
        Por se tratar de plataforma educacional, podemos tratar dados de menores. O cadastro de
        menores deve ser realizado com o consentimento e a supervisão de pais ou responsáveis,
        sempre no melhor interesse do menor (Art. 14 da LGPD).
      </p>

      <h2>8. Segurança</h2>
      <p>
        Adotamos medidas técnicas e organizacionais para proteger seus dados (senhas com hash,
        controle de acesso, criptografia em trânsito). Nenhum sistema é 100% seguro; em caso de
        incidente relevante, notificaremos os titulares e a ANPD conforme a lei.
      </p>

      <h2>9. Cookies</h2>
      <p>
        Utilizamos cookies essenciais e de métricas. Consulte a nossa{" "}
        <a href="/cookies">Política de Cookies</a>.
      </p>

      <h2>10. Alterações</h2>
      <p>
        Podemos atualizar esta Política. Mudanças relevantes serão comunicadas pela plataforma ou por
        e-mail.
      </p>

      <h2>11. Contato</h2>
      <p>
        Dúvidas sobre privacidade:{" "}
        <a href="mailto:privacidade@educonnect.com.br">[privacidade@educonnect.com.br]</a>.
      </p>
    </>
  )
}
