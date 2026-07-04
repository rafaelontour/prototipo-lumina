import Link from "next/link";
import { ArrowRight, Bot, FileText, Workflow } from "lucide-react";

export default function HomePage() {
  return (
    <section className="home-screen">
      <div className="home-copy">
        <div className="home-kicker">
          <img src="/fiocruz_logos/lumina_laranja.png" alt="Lumina" />
          <span>Revisão acadêmica assistida</span>
        </div>
        <h1>Revise trabalhos cientificos com apoio de IA e foco no documento.</h1>
        <p>
          Envie um PDF, receba uma analise inicial automatica e converse com um revisor academico
          contextualizado pelo conteudo do arquivo.
        </p>
        <Link className="home-cta" href="/oiac-ia">
          Acessar Oiac IA
          <ArrowRight size={18} />
        </Link>
      </div>
      <div className="home-panel" aria-label="Recursos principais">
        <div className="home-feature">
          <Bot size={22} />
          <div>
            <strong>Oiac IA</strong>
            <span>Analise automatica, chat e feedbacks vinculados ao PDF.</span>
          </div>
        </div>
        <div className="home-feature">
          <FileText size={22} />
          <div>
            <strong>Documento no centro</strong>
            <span>Visualize paginas, navegue por comentarios e mantenha o texto em foco.</span>
          </div>
        </div>
        <div className="home-feature">
          <Workflow size={22} />
          <div>
            <strong>Documentos</strong>
            <span>Organize TCCs, envie componentes e acompanhe versões analisadas pela IA.</span>
          </div>
        </div>
      </div>
    </section>
  );
}
