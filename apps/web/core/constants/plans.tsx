/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Mail, MessageCircle, MessageSquare } from "lucide-react";
import { EProductSubscriptionEnum } from "@plane/types";
// plane imports
import { cn } from "@plane/utils";

export type TPlanFeatureData = React.ReactNode | boolean | null;

// TODO: we should change this type and use TProductSubscriptionType instead. Need changes in common constants.
export type TPlanePlans = "free" | "one" | "pro" | "business" | "enterprise";

export type TPlanDetail = {
  id: EProductSubscriptionEnum;
  name: React.ReactNode;
  monthlyPrice?: number;
  yearlyPrice?: number;
  monthlyPriceSecondaryDescription?: React.ReactNode;
  yearlyPriceSecondaryDescription?: React.ReactNode;
  buttonCTA?: React.ReactNode;
  isActive: boolean;
};

type TPlanFeatureDetails = {
  title: React.ReactNode;
  description?: React.ReactNode;
  selfHostedDescription?: React.ReactNode;
  comingSoon?: boolean;
  selfHostedOnly?: boolean;
  cloud: Record<TPlanePlans, TPlanFeatureData>;
  "self-hosted"?: Record<TPlanePlans, TPlanFeatureData>;
};

type TPlansComparisonDetails = {
  id: string;
  title: React.ReactNode;
  comingSoon?: boolean;
  cloudOnly?: boolean;
  selfHostedOnly?: boolean;
  features: TPlanFeatureDetails[];
};

type PlanePlans = {
  planDetails: Record<TPlanePlans, TPlanDetail>;
  planHighlights: Record<TPlanePlans, string[]>;
  planComparison: TPlansComparisonDetails[];
};

function ForumIcon({ className }: { className?: string }) {
  return <MessageSquare className={cn(className, "size-5 text-secondary")} />;
}

export function ComingSoonBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "w-fit rounded-sm bg-accent-primary px-1.5 py-0.5 text-9 font-semibold whitespace-nowrap text-on-color",
        className
      )}
    >
      COMING SOON
    </span>
  );
}

export const PLANS_LIST: TPlanePlans[] = ["free", "one", "pro", "business", "enterprise"];

export const PLANS_COMPARISON_LIST: TPlansComparisonDetails[] = [
  {
    id: "project-work-tracking",
    title: "Acompanhamento de projetos e trabalho",
    features: [
      {
        title: "Projetos",
        description: "Adicione projetos para abrigar itens de trabalho, ciclos e módulos.",
        cloud: {
          free: true,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Itens de trabalho",
        description: "Adicione trabalho por meio de itens de trabalho, defina propriedades para acompanhamento e adicione a\nciclos ou módulos.",
        cloud: {
          free: true,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Comentários",
        description: "Respond to work items, @mention members, and brainstorm\ntogether without leaving Avião.",
        cloud: {
          free: true,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Ciclos",
        description: "Acompanhe o trabalho em períodos definidos com frequências diferentes.",
        cloud: {
          free: true,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Módulos",
        description: "Agrupe trabalho replicável em módulos com seus próprios\nresponsáveis.",
        cloud: {
          free: true,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Admissão",
        description:
          "Veja sugestões e feedback de visualizadores e\nconvidados antes de decidir adicioná-los ao seu\nprojeto.",
        cloud: {
          free: true,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Estimativas",
        description: "Meça o esforço em pontos em um sistema que funciona para\nvocê.",
        cloud: {
          free: "Basic",
          one: "Basic",
          pro: "Advanced",
          business: "Advanced",
          enterprise: "Advanced",
        },
      },
    ],
  },
  {
    id: "project-work-management",
    title: "Gestão de projetos e trabalho",
    features: [
      {
        title: "Operações em massa",
        description: "Adicione vários itens de trabalho a ciclos ou módulos, transfira-os\nou edite suas propriedades.",
        cloud: {
          free: false,
          one: "Limited props",
          pro: "All props",
          business: (
            <span className="flex flex-col items-end gap-1 lg:items-center">
              <ComingSoonBadge />
              Transferências e conversões de item de trabalho
            </span>
          ),
          enterprise: (
            <span className="flex flex-col items-end gap-1 lg:items-center">
              <ComingSoonBadge />
              Transferências e conversões de item de trabalho
            </span>
          ),
        },
      },
      {
        title: "Controle de tempo e registros de horas",
        description: "Acompanhe o tempo por item de trabalho, veja relatórios agregados e\nfiltre conforme a necessidade.",
        cloud: {
          free: false,
          one: "Basic",
          pro: "Historical timesheets",
          business: "Historical timesheets\nand approvals",
          enterprise: "Historical timesheets\nand approvals",
        },
      },
      {
        title: "Ciclos ativos",
        description: "Veja todos os ciclos em andamento em todos os projetos ou, em breve, em\num único projeto.",
        cloud: {
          free: false,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Tipos de item de trabalho",
        description: "Crie seus próprios tipos de item de trabalho com suas próprias\npropriedades.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Propriedades personalizadas",
        description: "Crie suas próprias propriedades e aplique-as ao seu\nespaço de trabalho ou projeto.",
        cloud: {
          free: false,
          one: false,
          pro: "Project-level\ncustom properties",
          business: "Workspace-level\nproperties and roll-ups",
          enterprise: "Workspace-level\nproperties and roll-ups",
        },
      },
      {
        title: "Dependências no Gantt",
        description: "Ajuste os cronogramas de itens de trabalho dependentes visualmente no\nnosso layout de Gantt.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Transferências de item de trabalho",
        description: "Mova um item de trabalho de um projeto ou ciclo para\noutro.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Transferência automática de itens do ciclo",
        description:
          "Transfira itens de trabalho incompletos de um ciclo concluído\npara o próximo ciclo ou para o estado padrão do projeto. ",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Épicos",
        description: "Organize o trabalho de longo prazo em épicos que abrigam itens de trabalho,\nciclos e módulos.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Iniciativas",
        description: "Crie iniciativas para agrupar vários épicos.",
        comingSoon: true,
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Marcos",
        description:
          "Adicione marcadores a Projetos, Épicos e Iniciativas para manter sua\nequipe no rumo e reportar o progresso.",
        comingSoon: true,
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Visão geral do módulo",
        description: "Assim como nas visões gerais de ciclo, veja detalhes relevantes e\ngráficos de progresso para cada módulo.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Atribuição automática em módulos",
        description: "Escolha regras de atribuição para itens de trabalho em um\nmódulo, incluindo Linear, Rodízio ou Capacidade.",
        cloud: {
          free: false,
          one: false,
          pro: "Linear",
          business: "Round-robin and Capacity",
          enterprise: "Round-robin and Capacity",
        },
      },
      // {
      //   title: "Visão geral do projeto",
      //   description: "Veja instantâneos em tempo real do seu projeto com\nmétricas essenciais.",
      //   comingSoon: true,
      //   cloud: {
      //     free: false,
      //     one: false,
      //     pro: true,
      //     business: true,
      //     enterprise: true,
      //   },
      // },
      {
        title: "Projetos públicos, privados e secretos",
        description:
          "Projetos públicos são visíveis e acessíveis a\ntodos. Os privados são visíveis, mas precisam de aprovação\npara participar. Projetos secretos não são visíveis nem acessíveis.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Estado dos projetos",
        description:
          "Veja todos os projetos distribuídos por estados que destacam\naqueles que precisam de atenção e os que estão no rumo.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      // {
      //   title: "Atualizações do projeto",
      //   description:
      //     "Keep stakeholders in the loop with a dedicated\nspace for updates that everyone in the project can\nsee.",
      //   comingSoon: true,
      //   cloud: {
      //     free: false,
      //     one: false,
      //     pro: true,
      //     business: true,
      //     enterprise: true,
      //   },
      // },
      {
        title: "Modelos de item de trabalho predefinidos",
        description:
          "Escolha entre os modelos de item de trabalho disponíveis que\npersonalizam tipos e propriedades de item de trabalho para vários\ncasos de uso.",
        comingSoon: true,
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Ciclos de equipe",
        description: "Veja vários ciclos em vários projetos de uma só vez.",
        cloud: {
          free: false,
          one: false,
          pro: false,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Modelos de projeto",
        description: "Salve estados, fluxos de trabalho, automações e outras\nconfigurações de projeto em modelos.",
        cloud: {
          free: false,
          one: false,
          pro: false,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Linhas de base e desvios",
        description: "Defina linhas de base para o progresso dos seus projetos\ne foque nos desvios.",
        cloud: {
          free: false,
          one: false,
          pro: false,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Comunicações agendadas",
        description: "Agende relatórios, notificações e mensagens para\nferramentas de terceiros.",
        cloud: {
          free: false,
          one: false,
          pro: false,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Responsáveis pela admissão",
        description: "Atribua itens de admissão aprovados a um membro por\npadrão.",
        cloud: {
          free: false,
          one: false,
          pro: false,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "SLAs personalizados",
        description: "Defina matrizes de SLA para itens de trabalho sensíveis ao tempo.",
        cloud: {
          free: false,
          one: false,
          pro: false,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Formulários de admissão",
        description: "Receba itens de admissão a partir de formulários web\nacessíveis externamente.",
        cloud: {
          free: false,
          one: false,
          pro: false,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "E-mails para admissão",
        description: "Obtenha um endereço de e-mail para registrar itens de trabalho\ndiretamente na Admissão de um projeto.",
        comingSoon: true,
        cloud: {
          free: false,
          one: false,
          pro: false,
          business: true,
          enterprise: true,
        },
      },
    ],
  },
  {
    id: "visualization",
    title: "Visualização",
    features: [
      {
        title: "Layouts",
        description:
          "Escolha entre os layouts de Lista, Quadro, Calendário,\nGantt ou Planilha para seus itens de trabalho.",
        cloud: {
          free: true,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Visualizações",
        description: "Salve opções de ordenação, filtro e exibição de um layout em uma\nvisualização.",
        cloud: {
          free: true,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Visualizações compartilhadas",
        description: "Escolha alguns membros para compartilhar uma visualização.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Publicar visualizações",
        description: "Publique uma visualização na Internet e deixe seus clientes\ninteragirem com ela.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Painéis e widgets",
        description: "Crie seus próprios painéis com widgets personalizados\ne tipos de dados.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
    ],
  },
  {
    id: "analytics-reports",
    title: "Análises e relatórios",
    features: [
      {
        title: "Gráficos de progresso",
        description:
          "Track progress in cycles, modules, and overviews\nthroughout Avião without switching to dashboards\nor Analytics.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Relatórios de ciclo",
        description: "Obtenha relatórios de ciclo sob demanda durante e após um\nciclo. Revisite os relatórios a qualquer momento por links permanentes.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Insights",
        description: "Retrospectiva, insights sob demanda e previsões.",
        comingSoon: true,
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      // {
      //   title: "Cápsula do tempo",
      //   description: "Volte na linha do tempo do seu projeto e veja instantâneos de\nmomentos específicos.",
      //   comingSoon: true,
      //   cloud: {
      //     free: false,
      //     one: false,
      //     pro: false,
      //     business: true,
      //     enterprise: true,
      //   },
      // },
      {
        title: "Análises avançadas de páginas",
        description: "Veja quem está visualizando, compartilhando e comentando\nsuas páginas, além de outras informações úteis.",
        comingSoon: true,
        cloud: {
          free: false,
          one: false,
          pro: false,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Relatórios personalizados",
        description: "Gere relatórios por qualquer dimensão e métrica\nem todo o seu projeto ou espaço de trabalho.",
        comingSoon: true,
        cloud: {
          free: false,
          one: false,
          pro: false,
          business: true,
          enterprise: true,
        },
      },
    ],
  },
  {
    id: "navigation",
    title: "Navegação",
    features: [
      {
        title: "Power K",
        description: "Access a keyboard-first gateway to almost anything\nin Avião.",
        cloud: {
          free: true,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      // {
      //   title: "Pesquisa",
      //   description: "Pesquise por meio de consultas em linguagem natural, operadores ou\nPQL",
      //   cloud: {
      //     free: "Basic text search",
      //     one: "Basic text search",
      //     pro: (
      //       <span className="flex flex-col items-end lg:items-center gap-1">
      //         <span className="bg-[#3f76ff] text-on-color font-semibold text-9 p-0.5 w-fit whitespace-nowrap rounded-xs">
      //           COMING SOON
      //         </span>
      //         Operator capsules from text or PQL
      //       </span>
      //     ),
      //     business: (
      //       <span className="flex flex-col items-end lg:items-center gap-1">
      //         <span className="bg-[#3f76ff] text-on-color font-semibold text-9 p-0.5 w-fit whitespace-nowrap rounded-xs">
      //           COMING SOON
      //         </span>
      //         Operator capsules from text or PQL
      //       </span>
      //     ),
      //     enterprise: (
      //       <span className="flex flex-col items-end lg:items-center gap-1">
      //         <span className="bg-[#3f76ff] text-on-color font-semibold text-9 p-0.5 w-fit whitespace-nowrap rounded-xs">
      //           COMING SOON
      //         </span>
      //         Operator capsules from text or PQL
      //       </span>
      //     ),
      //   },
      // },
      {
        title: "PQL",
        description:
          "Write Avião Query Language in search with support\nfor Boolean operators. Soon, you can write natural\nlanguage queries.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
    ],
  },
  {
    id: "workspace-user-management",
    title: "Gestão de espaço de trabalho e usuários",
    features: [
      {
        title: "Limite de membros",
        description: "Número de assentos que podem usar os recursos de gestão de projetos e trabalho",
        selfHostedDescription: "Number of users that our standard infra supports\nIncrease infra to get more users",
        cloud: {
          free: "12",
          one: "",
          pro: "Unlimited",
          business: "Unlimited",
          enterprise: "Unlimited",
        },
        "self-hosted": {
          free: "~50",
          one: "~50",
          pro: "~200",
          business: "~200",
          enterprise: "Unlimited",
        },
      },
      {
        title: "Cargos",
        description: "Escolha um dos quatro cargos predefinidos ou crie\ncargos personalizados com RBAC.",
        cloud: {
          free: "Basic",
          one: "Basic",
          pro: "Pre-defined roles",
          business: "RBAC",
          enterprise: "GAC",
        },
      },
      {
        title: "Convidados",
        description: "Permita que alguns usuários vejam tudo ou apenas seus itens de trabalho em\num projeto.",
        cloud: {
          free: false,
          one: "5 per paid member",
          pro: "5 per paid member",
          business: "5 per paid member",
          enterprise: "5 per paid member",
        },
      },
      {
        title: "Aprovações",
        description: "Defina aprovações de espaço de trabalho, projeto e tipo de item de trabalho para\nadministradores designados.",
        comingSoon: true,
        cloud: {
          free: false,
          one: false,
          pro: false,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Interface de administração",
        description: "Obtenha uma visão geral administrativa para gerenciar as configurações\ndo espaço de trabalho e do projeto.",
        cloud: {
          free: false,
          one: false,
          pro: false,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Logs de atividade do espaço de trabalho",
        description: "Veja logs de atividade filtráveis de todo o seu\nespaço de trabalho.",
        cloud: {
          free: false,
          one: false,
          pro: false,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Logs de auditoria via API",
        description: "See a full-workspace audit log and use APIs to flag\nAvião activity in compliance systems.",
        comingSoon: true,
        cloud: {
          free: false,
          one: false,
          pro: false,
          business: true,
          enterprise: true,
        },
      },
    ],
  },
  {
    id: "automations-workflows",
    title: "Automações e fluxos de trabalho",
    features: [
      {
        title: "Gatilho e ação",
        description: "Escolha um gatilho e uma ação correspondente por\nfluxo de automação.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Automação de decisões e laços",
        description: "Use ações como gatilhos indefinidamente em um\nfluxo de automação.",
        comingSoon: true,
        cloud: {
          free: false,
          one: false,
          pro: false,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Número de automações",
        description: "Número total de fluxos de automação no seu\nespaço de trabalho",
        cloud: {
          free: false,
          one: false,
          pro: "5,000",
          business: "10,000",
          enterprise: "Unlimited",
        },
      },
    ],
  },
  {
    id: "knowledge-management",
    title: "Gestão de conhecimento",
    features: [
      {
        title: "Páginas",
        description: "Crie bases de conhecimento para suas equipes que sejam\nacessíveis e compartilháveis.",
        cloud: {
          free: true,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Colaboração em tempo real",
        description: "Edite uma página junto com membros do seu projeto,\nequipe ou espaço de trabalho.",
        cloud: {
          free: false,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Incorporação de itens de trabalho",
        description: "Incorpore itens de trabalho de qualquer projeto do qual você seja\nmembro.",
        cloud: {
          free: false,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Vincular a itens de trabalho",
        description: "Vincule páginas a itens de trabalho em uma seção separada nos detalhes\ndo item de trabalho.",
        cloud: {
          free: false,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Publicar",
        description:
          "Publique suas páginas na web para usuários externos e permita\nque comentem sem entrar no seu espaço de trabalho.",
        cloud: {
          free: false,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Wiki",
        description: "Crie wikis ou bases de conhecimento para toda a empresa\nsem criar um projeto.",
        cloud: {
          free: false,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Exportações",
        description: "Exporte o conteúdo da página para PDFs ou documentos compatíveis\ncom o Word.",
        cloud: {
          free: false,
          one: false,
          pro: "One download\nat a time",
          business: "Queued downloads",
          enterprise: "Queued downloads",
        },
      },
      {
        title: "Modelos",
        description: "Use páginas como modelos para seu projeto, equipe ou\nespaço de trabalho.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Versões",
        description: "Veja versões restauráveis das edições das suas páginas.",
        cloud: {
          free: false,
          one: false,
          pro: "2 days",
          business: "3 months",
          enterprise: "Unlimited",
        },
      },
      {
        title: "Bancos de dados e fórmulas",
        description:
          "Insira bancos de dados e fórmulas em uma página sem\nse preocupar em perder texto, imagens ou outros tipos de\nconteúdo.",
        comingSoon: true,
        cloud: {
          free: false,
          one: false,
          pro: false,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Páginas aninhadas",
        description: "Páginas dentro de uma página; organize suas páginas\ncomo achar melhor para a divulgação\nprogressiva.",
        comingSoon: true,
        cloud: {
          free: false,
          one: false,
          pro: false,
          business: "Word-compatible + other format downloads",
          enterprise: "Word-compatible + other format downloads",
        },
      },
    ],
  },
  {
    id: "importers",
    title: "Importadores",
    features: [
      {
        title: "Jira",
        description: "Importe seus itens de trabalho e membros do Jira.",
        cloud: {
          free: "Without custom props",
          one: "Without custom props",
          pro: "With custom props",
          business: "With custom props",
          enterprise: "With custom props",
        },
      },
      {
        title: "GitHub",
        description: "Importe seus itens de trabalho e membros do GitHub.",
        cloud: {
          free: "Without custom props",
          one: "Without custom props",
          pro: "With custom props",
          business: "With custom props",
          enterprise: "With custom props",
        },
      },
    ],
  },
  {
    id: "integrations",
    title: "Integrações",
    comingSoon: true,
    features: [
      {
        title: "GitHub",
        description:
          "Sync Avião work items and states to GitHub work items and\nstates. Update GitHub automatically with activity\nfrom Avião and vice-versa.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Slack",
        description: "Get Avião activity in Slack and use / commands in\nSlack to make changes in Avião.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Zapier",
        description: "Execute automações if-then-else usando o Zapier.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Zendesk",
        description: "Create Avião work items from Zendesk tickets.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Freshdesk",
        description: "Create Avião work items from Freshdesk tickets.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
    ],
  },
  {
    id: "storage",
    title: "Armazenamento",
    cloudOnly: true,
    features: [
      {
        title: "Espaço",
        description: "Armazenamento total permitido por espaço de trabalho",
        cloud: {
          free: "5GB",
          one: false,
          pro: "1 TB",
          business: "5 TB",
          enterprise: "Custom",
        },
      },
      {
        title: "Tamanho máximo de arquivo",
        description: "Limite para uploads no seu espaço de trabalho",
        cloud: {
          free: "5 MB",
          one: false,
          pro: "100 MB",
          business: "200 MB",
          enterprise: "Custom",
        },
      },
    ],
  },
  {
    id: "security",
    title: "Segurança",
    features: [
      {
        title: "SAML",
        description: "Get the officially supported SAML implementation\nand make Avião secure with any IdP.",
        cloud: {
          free: false,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "OIDC",
        description: "Get the officially supported OIDC implementation\nand make Avião secure with any IdP.",
        selfHostedOnly: true,
        cloud: {
          free: false,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Segurança de domínio",
        description:
          "Choose other domains that can authenticate into\nyour Avião workspace or restrict all but one domain.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Autenticação de dois fatores e chaves de acesso",
        description: "Secure your Avião workspace with device-\ndependent two-factor authentication and passkeys. ",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Política de senhas",
        description: "Defina políticas de senha personalizadas de acordo com seus\nrequisitos de conformidade.",
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "LDAP",
        description: "Get our official LDAP implementation and secure\nyour Avião workspace with your LDAP server.",
        comingSoon: true,
        cloud: {
          free: false,
          one: false,
          pro: false,
          business: false,
          enterprise: true,
        },
      },
    ],
  },
  {
    id: "self-hosted",
    title: "Auto-hospedado",
    selfHostedOnly: true,
    features: [
      {
        title: "God Mode",
        description: "Manage your self-hosted Avião instance better with\nan instance admin interface.",
        cloud: {
          free: true,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Implantação com um clique",
        description: "Install and deploy your self-hosted Avião to any\nprivate cloud with a single-line command.",
        cloud: {
          free: false,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "App no Marketplace da Digital Ocean",
        description: "Obtenha nosso app compatível com a Digital Ocean no\nmarketplace deles.",
        cloud: {
          free: false,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "App da Plataforma Heroku",
        description: "Obtenha nosso app compatível com a Plataforma Heroku e implante\nno Heroku facilmente.",
        cloud: {
          free: false,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "AWS AMI",
        description: "Obtenha nosso app compatível com AMI no\nmarketplace da AWS.",
        cloud: {
          free: false,
          one: true,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
      {
        title: "Implantações privadas",
        description: "Obtenha nosso app Cloud hospedado em uma nuvem privada\ngerenciada por nós.",
        comingSoon: true,
        cloud: {
          free: false,
          one: false,
          pro: false,
          business: false,
          enterprise: true,
        },
      },
    ],
  },
  {
    id: "support",
    title: "Suporte",
    features: [
      {
        title: "Canais",
        description: "Obtenha acesso a um ou mais canais de suporte\nconforme o seu plano.",
        cloud: {
          free: (
            <>
              <ForumIcon className="size-4" />
            </>
          ),
          one: (
            <div className="flex items-center gap-1">
              <Mail className="size-4 flex-shrink-0" />
              <ForumIcon className="size-4 flex-shrink-0" />
            </div>
          ),
          pro: (
            <div className="flex items-center gap-1">
              <Mail className="size-4 flex-shrink-0" />
              <ForumIcon className="size-4 flex-shrink-0" />
              <MessageCircle className="size-4 flex-shrink-0" />
            </div>
          ),
          business: "Full-suite\nprofessional services",
          enterprise: "Full-suite\nprofessional services",
        },
      },
      {
        title: "SLA",
        description: (
          <>
            Get business-friendly SLAs with higher plans. SLAs are by priority of work item and tiers{" "}
            <a href="https://plane.so/talk-to-sales" target="_blank" rel="noopener noreferrer" className="underline">
              can be requested
            </a>
            .
          </>
        ),
        cloud: {
          free: false,
          one: false,
          pro: true,
          business: true,
          enterprise: true,
        },
      },
    ],
  },
];

export const PLANE_PLANS: PlanePlans = {
  planDetails: {
    free: {
      id: EProductSubscriptionEnum.FREE,
      name: "Free",
      monthlyPrice: 0,
      yearlyPrice: 0,
      isActive: true,
    },
    one: {
      id: EProductSubscriptionEnum.ONE,
      name: "One",
      monthlyPrice: 799,
      yearlyPrice: 799,
      monthlyPriceSecondaryDescription: "per workspace",
      yearlyPriceSecondaryDescription: "per workspace",
      buttonCTA: "Upgrade",
      isActive: false,
    },
    pro: {
      id: EProductSubscriptionEnum.PRO,
      name: "Pro",
      monthlyPrice: 8,
      yearlyPrice: 6,
      monthlyPriceSecondaryDescription: "billed monthly",
      yearlyPriceSecondaryDescription: "billed yearly",
      buttonCTA: "Upgrade",
      isActive: true,
    },
    business: {
      id: EProductSubscriptionEnum.BUSINESS,
      name: "Business",
      monthlyPriceSecondaryDescription: "billed monthly",
      yearlyPriceSecondaryDescription: "billed yearly",
      buttonCTA: "Falar com vendas",
      isActive: false,
    },
    enterprise: {
      id: EProductSubscriptionEnum.ENTERPRISE,
      name: "Enterprise",
      monthlyPriceSecondaryDescription: "billed monthly",
      yearlyPriceSecondaryDescription: "billed yearly",
      buttonCTA: "Falar com vendas",
      isActive: false,
    },
  },
  planHighlights: {
    free: ["Upto 12 users", "Páginas", "Unlimited projects", "Unlimited cycles and modules"],
    one: ["Upto 50 users", "OIDC and SAML", "Active cycles", "Limited time tracking"],
    pro: ["Unlimited users", "Custom work items + Properties", "Work item templates", "Full Time Tracking"],
    business: ["RBAC", "Modelos de projeto", "Linhas de base e desvios", "Relatórios personalizados"],
    enterprise: ["Private + managed deployments", "GAC", "LDAP support", "Bancos de dados e fórmulas"],
  },
  planComparison: PLANS_COMPARISON_LIST,
};
