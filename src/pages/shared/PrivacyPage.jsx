/**
 * PrivacyPage — Política de Privacidade do Avante (LGPD).
 * Conteúdo base; revise com apoio jurídico antes da operação comercial.
 */
import LegalLayout, { LegalSection } from './LegalLayout'

export default function PrivacyPage() {
  return (
    <LegalLayout title="Política de Privacidade" updatedAt="22 de junho de 2026">
      <p>
        Esta Política descreve como o <strong>Avante</strong> coleta, usa, compartilha e
        protege os seus dados pessoais, em conformidade com a <strong>Lei Geral de Proteção
        de Dados (LGPD — Lei nº 13.709/2018)</strong>.
      </p>

      <LegalSection n="1" title="Controlador dos dados">
        <p>
          O Avante é o controlador dos dados tratados na plataforma. Contato do encarregado
          (DPO): <strong>privacidade@avante.app</strong>.
        </p>
      </LegalSection>

      <LegalSection n="2" title="Dados que coletamos">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li><strong>Cadastro:</strong> nome, e-mail, telefone, senha (armazenada de forma criptografada).</li>
          <li><strong>Veterinário:</strong> CRMV, CPF, áreas de atuação, foto e localização de atendimento.</li>
          <li><strong>Tutor:</strong> animais cadastrados, endereços/propriedades, histórico de solicitações.</li>
          <li><strong>Uso:</strong> mensagens de chat, avaliações, favoritos e dados de navegação.</li>
          <li><strong>Localização do Tutor:</strong> apenas quando você a compartilha voluntariamente (ex.: enviar localização no chat ou marcar o local do atendimento).</li>
          <li><strong>Localização do Veterinário:</strong> coletada automaticamente pelo dispositivo do profissional e compartilhada em tempo real com o Tutor enquanto o status do atendimento estiver como "A Caminho". A coleta cessa imediatamente ao iniciar ou encerrar o atendimento.</li>
        </ul>
      </LegalSection>

      <LegalSection n="3" title="Para que usamos seus dados (finalidades)">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Criar e gerenciar sua conta e perfil.</li>
          <li>Conectar Tutores e Veterinários e viabilizar os agendamentos.</li>
          <li>Permitir o chat e o envio de notificações sobre seus atendimentos.</li>
          <li>Processar planos e pagamentos (via provedores terceiros).</li>
          <li>Prevenir fraudes, garantir a segurança e cumprir obrigações legais.</li>
        </ul>
      </LegalSection>

      <LegalSection n="4" title="Bases legais (art. 7º da LGPD)">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li><strong>Execução de contrato:</strong> para prestar o serviço que você solicitou.</li>
          <li><strong>Consentimento:</strong> para localização e notificações.</li>
          <li><strong>Legítimo interesse:</strong> para segurança e melhoria da plataforma.</li>
          <li><strong>Obrigação legal:</strong> quando exigido por lei.</li>
        </ul>
      </LegalSection>

      <LegalSection n="5" title="Compartilhamento">
        <p>
          Compartilhamos dados apenas quando necessário: entre Tutor e Veterinário para o
          atendimento, com provedores de infraestrutura (ex.: Google Firebase) e de pagamento,
          e com autoridades quando exigido por lei. <strong>Não vendemos seus dados.</strong>
        </p>
      </LegalSection>

      <LegalSection n="6" title="Armazenamento e segurança">
        <p>
          Os dados são armazenados em servidores do Google Firebase (com medidas de segurança
          padrão de mercado) e protegidos por regras de acesso. Dados sensíveis (como CPF)
          ficam em área restrita, acessível apenas ao próprio usuário. As conversas de chat
          são temporárias e excluídas automaticamente após 7 dias de inatividade.
        </p>
      </LegalSection>

      <LegalSection n="7" title="Seus direitos (art. 18 da LGPD)">
        <p>Você pode, a qualquer momento, solicitar:</p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Confirmação e acesso aos seus dados.</li>
          <li>Correção de dados incompletos ou desatualizados.</li>
          <li>Anonimização, bloqueio ou eliminação de dados desnecessários.</li>
          <li>Portabilidade e informação sobre compartilhamentos.</li>
          <li>Revogação do consentimento e exclusão da conta.</li>
        </ul>
        <p>Para exercer seus direitos: <strong>privacidade@avante.app</strong>.</p>
      </LegalSection>

      <LegalSection n="8" title="Retenção e exclusão">
        <p>
          Mantemos seus dados enquanto a conta estiver ativa ou conforme necessário para
          cumprir obrigações legais. Ao excluir a conta, removemos ou anonimizamos seus
          dados, salvo aqueles que a lei exige conservar.
        </p>
      </LegalSection>

      <LegalSection n="9" title="Cookies e tecnologias">
        <p>
          Usamos armazenamento local do navegador para manter sua sessão e preferências
          (ex.: tema, conversa da IA). Não usamos cookies de rastreamento de terceiros para
          publicidade.
        </p>
      </LegalSection>

      <LegalSection n="10" title="Menores de idade">
        <p>
          A plataforma é destinada a maiores de 18 anos. Não coletamos intencionalmente dados
          de menores.
        </p>
      </LegalSection>

      <LegalSection n="11" title="Alterações desta Política">
        <p>
          Podemos atualizar esta Política. Mudanças relevantes serão comunicadas no app, com
          a data de atualização revisada no topo.
        </p>
      </LegalSection>

      <LegalSection n="12" title="Contato">
        <p>
          Dúvidas sobre privacidade ou para exercer seus direitos:
          <strong> privacidade@avante.app</strong>.
        </p>
      </LegalSection>
    </LegalLayout>
  )
}
