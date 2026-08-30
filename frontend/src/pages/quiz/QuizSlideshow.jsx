import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { contentService } from "../../services";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";
import SlideshowPlayer from "../../components/quiz/SlideshowPlayer";

// Slideshow for a MAIN-section quiz (Subject → Topic → Session → Quiz). Loads
// the quiz's questions (with answers) and its breadcrumb, then hands off to the
// shared SlideshowPlayer. Admin-only route — see App.jsx.
export default function QuizSlideshow() {
  const { subjectId, topicId, sessionId, quizId } = useParams();
  const [questions, setQuestions] = useState([]);
  const [quizTitle, setQuizTitle] = useState("Quiz");
  const [crumb, setCrumb] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([
      contentService.quizQuestions(quizId),
      contentService.subjects().catch(() => []),
      contentService.topics(subjectId).catch(() => []),
      contentService.sessions(topicId).catch(() => []),
      contentService.quizzes(sessionId).catch(() => []),
    ])
      .then(([qs, subjects, topics, sessions, quizzes]) => {
        setQuestions(Array.isArray(qs) ? qs : []);
        const subj = subjects.find?.((s) => s._id === subjectId);
        const top = topics.find?.((t) => t._id === topicId);
        const ses = sessions.find?.((s) => s._id === sessionId);
        const qz = quizzes.find?.((q) => q._id === quizId);
        if (qz) setQuizTitle(qz.title);
        setCrumb([subj?.name, top?.title, ses?.title, qz?.title].filter(Boolean).join(" › "));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [quizId, subjectId, topicId, sessionId]);

  useEffect(load, [load]);

  if (loading) return <div className="container-page"><Loading label="Loading quiz…" /></div>;
  if (error) return <div className="container-page"><ErrorState message={error} onRetry={load} /></div>;
  if (!questions.length) return <div className="container-page"><EmptyState message="No questions in this quiz yet." /></div>;

  return (
    <SlideshowPlayer
      questions={questions}
      quizTitle={quizTitle}
      crumb={crumb}
      backTo={`/public-quizzes/${subjectId}/${topicId}/${sessionId}`}
    />
  );
}
