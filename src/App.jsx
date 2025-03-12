import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import ProjectVote from "./ProjectVote";
import Voted from "./Voted";

function App() {
  return (
    <Routes>
        <Route path="/" element={<center>YUKTHI PROJECT EXPO</center>} />
        <Route path="/:id" element={<ProjectVote />} />
        <Route path="/vote" element={<Voted />} />

      </Routes>
  );
}

export default App;
