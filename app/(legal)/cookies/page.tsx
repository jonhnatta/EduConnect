import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Política de Cookies | EduConnect",
  description: "Como a EduConnect usa cookies e tecnologias semelhantes.",
}

const LAST_UPDATE = "16 de julho de 2026"

export default function CookiesPage() {
  return (
    <>
      <h1>Política de Cookies</h1>
      <p className="text-sm text-gray-500">Última atualização: {LAST_UPDATE}</p>

      <p>
        Cookies são pequenos arquivos armazenados no seu navegador. Usamos cookies e tecnologias
        semelhantes para operar a plataforma, manter você autenticado e entender o uso do produto.
      </p>

      <h2>1. Tipos de cookies que usamos</h2>
      <table>
        <thead>
          <tr>
            <th>Categoria</th>
            <th>Finalidade</th>
            <th>Necessário?</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Essenciais</strong></td>
            <td>Sessão e autenticação (manter login), segurança e preferências básicas.</td>
            <td>Sim — sem eles a plataforma não funciona.</td>
          </tr>
          <tr>
            <td><strong>Métricas</strong></td>
            <td>Estatísticas de uso agregadas (Vercel Analytics) para melhorar o produto.</td>
            <td>Não — dependem do seu consentimento.</td>
          </tr>
        </tbody>
      </table>

      <h2>2. Gerenciamento</h2>
      <p>
        Ao acessar a plataforma, você pode aceitar ou recusar cookies não essenciais pelo banner de
        consentimento. Você também pode bloquear ou apagar cookies nas configurações do seu
        navegador — note que cookies essenciais são necessários para o login funcionar.
      </p>

      <h2>3. Cookies de terceiros</h2>
      <p>
        O Google pode definir cookies próprios quando você escolhe o login social. A ferramenta de
        métricas somente é carregada depois do consentimento explícito no banner.
      </p>

      <h2>4. Atualizações</h2>
      <p>
        Esta Política pode ser atualizada. Consulte também a nossa{" "}
        <a href="/privacidade">Política de Privacidade</a>.
      </p>
    </>
  )
}
