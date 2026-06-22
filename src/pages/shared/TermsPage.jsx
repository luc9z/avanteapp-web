/**
 * TermsPage — Termos de Uso do Avante.
 * Conteúdo base; revise com apoio jurídico antes da operação comercial.
 */
import LegalLayout, { LegalSection } from './LegalLayout'

export default function TermsPage() {
  return (
    <LegalLayout title="Termos de Uso" updatedAt="22 de junho de 2026">
      <p>
        Bem-vindo ao <strong>Avante</strong>. Estes Termos de Uso regem o acesso e a
        utilização da plataforma (aplicativo web) que conecta tutores de animais a
        médicos veterinários para atendimento a domicílio. Ao criar uma conta ou usar o
        Avante, você concorda com estes Termos.
      </p>

      <LegalSection n="1" title="Definições">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li><strong>Plataforma:</strong> o aplicativo Avante e seus serviços.</li>
          <li><strong>Tutor (Cliente):</strong> usuário que busca atendimento para seu animal.</li>
          <li><strong>Veterinário (Profissional):</strong> médico-veterinário com registro no CRMV que oferece atendimento.</li>
          <li><strong>Atendimento:</strong> serviço prestado pelo Veterinário ao animal do Tutor.</li>
        </ul>
      </LegalSection>

      <LegalSection n="2" title="A natureza do serviço">
        <p>
          O Avante é uma plataforma de <strong>intermediação</strong>. Conectamos Tutores e
          Veterinários, mas <strong>não prestamos serviços veterinários</strong> e não somos
          parte do contrato de atendimento. A responsabilidade técnica pelo atendimento é
          exclusivamente do Veterinário, conforme as normas do Conselho Federal de Medicina
          Veterinária (CFMV/CRMV).
        </p>
      </LegalSection>

      <LegalSection n="3" title="Cadastro e conta">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Você deve ter 18 anos ou mais e fornecer informações verdadeiras e atualizadas.</li>
          <li>O Veterinário declara possuir registro ativo no CRMV e habilitação para atuar.</li>
          <li>Você é responsável por manter a confidencialidade da sua senha e por toda atividade na sua conta.</li>
          <li>Podemos suspender ou encerrar contas que violem estes Termos ou a legislação.</li>
        </ul>
      </LegalSection>

      <LegalSection n="4" title="Agendamentos e cancelamentos">
        <p>
          O Tutor solicita o atendimento informando serviço, animal, data, horário e local.
          O Veterinário pode aceitar ou recusar. Cancelamentos e remarcações devem ser
          combinados entre as partes pelo chat da plataforma, com antecedência razoável.
        </p>
        <p className="mt-2">
          Ao marcar o status do atendimento como <strong>"A Caminho"</strong>, o Veterinário
          consente expressamente no compartilhamento de sua localização GPS em tempo real
          com o Tutor, exclusivamente durante o deslocamento até o local do atendimento.
          O compartilhamento é encerrado automaticamente ao iniciar ou finalizar o atendimento.
        </p>
      </LegalSection>

      <LegalSection n="5" title="Planos do Veterinário e pagamentos">
        <p>
          O Veterinário pode aderir a planos (Free, Essencial, Premium) com recursos
          distintos. Valores e benefícios são exibidos na tela de planos e podem ser
          atualizados. Pagamentos, quando aplicáveis, são processados por provedores
          terceiros; o Avante não armazena dados de cartão.
        </p>
      </LegalSection>

      <LegalSection n="6" title="Conduta do usuário">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Não usar a plataforma para fins ilícitos, fraudulentos ou abusivos.</li>
          <li>Não publicar conteúdo ofensivo, falso ou que viole direitos de terceiros.</li>
          <li>Tratar os demais usuários com respeito no chat e nas avaliações.</li>
        </ul>
      </LegalSection>

      <LegalSection n="7" title="Avaliações">
        <p>
          As avaliações refletem a opinião dos Tutores e ajudam a comunidade. Reservamo-nos
          o direito de remover avaliações que violem estes Termos.
        </p>
      </LegalSection>

      <LegalSection n="8" title="Limitação de responsabilidade">
        <p>
          O Avante não se responsabiliza por danos decorrentes do atendimento veterinário,
          por condutas dos usuários ou por indisponibilidades temporárias da plataforma.
          O serviço é fornecido "no estado em que se encontra".
        </p>
      </LegalSection>

      <LegalSection n="9" title="Privacidade">
        <p>
          O tratamento dos seus dados pessoais segue a nossa{' '}
          <a href="/privacy" className="text-primary font-semibold underline">Política de Privacidade</a>,
          em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
        </p>
      </LegalSection>

      <LegalSection n="10" title="Alterações">
        <p>
          Podemos atualizar estes Termos a qualquer momento. Mudanças relevantes serão
          comunicadas no app. O uso continuado após as alterações representa concordância.
        </p>
      </LegalSection>

      <LegalSection n="11" title="Contato">
        <p>
          Dúvidas sobre estes Termos: <strong>contato@avante.app</strong>.
        </p>
      </LegalSection>
    </LegalLayout>
  )
}
