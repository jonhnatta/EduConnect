import type { Metadata } from "next"
import { legalConfig } from "@/lib/config/legal"

export const metadata: Metadata = {
  title: "Termos de Uso | EduConnect",
  description: "Termos e condições de uso da plataforma EduConnect.",
}
export const dynamic = "force-dynamic"

const LAST_UPDATE = "16 de julho de 2026"

export default function TermosPage() {
  const legal = legalConfig()
  return (
    <>
      <h1>Termos de Uso</h1>
      <p className="text-sm text-gray-500">Última atualização: {LAST_UPDATE}</p>

      <p>
        Estes Termos regem o uso da plataforma EduConnect. Ao criar uma conta ou usar a plataforma,
        você concorda com estes Termos e com a nossa <a href="/privacidade">Política de Privacidade</a>.
      </p>

      <h2>1. A plataforma</h2>
      <p>
        A EduConnect é uma plataforma educacional que conecta professores e alunos, permitindo
        publicação de conteúdo, criação de turmas, atividades, avaliações e interação social.
      </p>

      <h2>2. Cadastro e conta</h2>
      <ul>
        <li>Você deve fornecer informações verdadeiras e mantê-las atualizadas.</li>
        <li>Você é responsável por manter a confidencialidade da sua senha e por toda atividade na sua conta.</li>
        <li>Contas de professor passam por verificação de identidade profissional antes da aprovação.</li>
        <li>Menores devem usar a plataforma com consentimento e supervisão dos responsáveis.</li>
      </ul>

      <h2>3. Conteúdo do usuário</h2>
      <ul>
        <li>Você mantém a titularidade do conteúdo que publica e é o único responsável por ele.</li>
        <li>Você concede à EduConnect uma licença não exclusiva para hospedar e exibir esse conteúdo na plataforma, conforme as configurações de visibilidade escolhidas.</li>
        <li>Você declara ter os direitos necessários sobre o conteúdo publicado e não infringir direitos de terceiros.</li>
      </ul>

      <h2>4. Conduta proibida</h2>
      <ul>
        <li>Publicar conteúdo ilícito, ofensivo, discriminatório, plagiado ou impróprio.</li>
        <li>Tentar burlar mecanismos de segurança, acessar dados de terceiros ou explorar vulnerabilidades.</li>
        <li>Usar a plataforma para spam, fraude ou qualquer finalidade ilegal.</li>
        <li>Compartilhar gabaritos/avaliações de forma a comprometer a integridade acadêmica.</li>
      </ul>

      <h2>5. Moderação</h2>
      <p>
        O conteúdo pode passar por revisão humana. Podemos remover conteúdo e suspender contas
        que violem estes Termos, com ou sem aviso prévio.
      </p>

      <h2>6. Disponibilidade e período de avaliação</h2>
      <p>
        A plataforma é fornecida &ldquo;no estado em que se encontra&rdquo;. Durante o período de
        piloto, funcionalidades podem mudar e a disponibilidade pode ser interrompida para
        manutenção. Não garantimos operação ininterrupta ou livre de erros.
      </p>

      <h2>7. Limitação de responsabilidade</h2>
      <p>
        Na máxima extensão permitida pela lei, a EduConnect não se responsabiliza por danos
        indiretos decorrentes do uso da plataforma ou de conteúdo publicado por usuários.
      </p>

      <h2>8. Encerramento</h2>
      <p>
        Você pode encerrar sua conta a qualquer momento. Podemos encerrar ou suspender contas que
        violem estes Termos.
      </p>

      <h2>9. Alterações</h2>
      <p>
        Podemos atualizar estes Termos. Mudanças relevantes serão comunicadas pela plataforma ou
        por e-mail; o uso continuado após a alteração implica concordância.
      </p>

      <h2>10. Lei aplicável e foro</h2>
      <p>
        Estes Termos são regidos pelas leis do Brasil. Fica eleito o foro da comarca de{" "}
        <strong>{legal.forum}</strong> para dirimir controvérsias, ressalvado o foro legalmente
        assegurado ao consumidor.
      </p>

      <h2>11. Contato</h2>
      <p>
        Dúvidas: <a href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a>.
      </p>
    </>
  )
}
