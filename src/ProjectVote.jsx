// ... imports remain the same
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import crypto from "crypto-js";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { createClient } from "@supabase/supabase-js";
import { QRCodeSVG } from "qrcode.react";
import "./css/ProjectVote.css";

const SECRET_KEY = import.meta.env.VITE_SECRET_KEY;
const BASE_URL = "https://yukthipoll.netlify.app"
    

const supabase = createClient(
  import.meta.env.VITE_SUPA_URL,
  import.meta.env.VITE_SUPA_KEY
);

const ProjectVote = () => {
  const { id } = useParams();
  const projectId = parseInt(id, 10);

  const [projects, setProjects] = useState([]);
  const [fingerprint, setFingerprint] = useState("");
  const [ip, setIp] = useState("");
  const [currentKey, setCurrentKey] = useState("");
  const [currentTimestamp, setCurrentTimestamp] = useState(0); // Keep this
  const [isAllowed, setIsAllowed] = useState(null);
  const [message, setMessage] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const { data, error } = await supabase
          .from("teams")
          .select("id, project_title");
        if (error) throw error;
        setProjects(
          data.map((team) => ({ id: team.id, name: team.project_title }))
        );
      } catch (err) {
        console.error("Error fetching projects:", err);
        setMessage("❌ Error loading projects");
      } finally {
        setLoadingProjects(false);
      }
    };
    fetchProjects();
  }, []);

  const project = projects.find((p) => p.id === projectId);

  // Generate key and timestamp together
  const generateKeyAndTimestamp = () => {
    const timestamp = Math.floor(Date.now() / 10000);
    const newKey = crypto
      .HmacSHA256(timestamp.toString(), SECRET_KEY)
      .toString();
    setCurrentTimestamp(timestamp);
    setCurrentKey(newKey);
  };

  useEffect(() => {
    FingerprintJS.load()
      .then((fp) => fp.get())
      .then((result) => setFingerprint(result.visitorId))
      .catch((err) => {
        console.error("Fingerprint failed:", err);
        setMessage("❌ Device identification failed");
      });

    fetch("https://api64.ipify.org?format=json")
      .then((res) => res.json())
      .then((data) => setIp(data.ip))
      .catch(() => setIp("unknown"));
  }, []);

  useEffect(() => {
    generateKeyAndTimestamp();
    const keyInterval = setInterval(generateKeyAndTimestamp, 10000);
    return () => clearInterval(keyInterval);
  }, []);

  useEffect(() => {
    if (!fingerprint || !projectId) return;

    const checkAndLockFingerprint = async () => {
      try {
        const { data: existingLink, error: fetchError } = await supabase
          .from("project_links")
          .select("fingerprint")
          .eq("project_id", projectId)
          .single();

        if (fetchError && fetchError.code !== "PGRST116") {
          setMessage("❌ Error checking project lock: " + fetchError.message);
          setIsAllowed(false);
          return;
        }

        if (existingLink) {
          if (existingLink.fingerprint === fingerprint) {
            setIsAllowed(true);
          } else {
            setIsAllowed(false);
            setMessage(
              "❌ This project is already logged in to another device (only 1 device login per project is allowed)"
            );
          }
        } else {
          const { error: insertError } = await supabase
            .from("project_links")
            .insert([{ project_id: projectId, fingerprint }]);

          if (insertError) {
            setMessage("❌ Error locking project: " + insertError.message);
            setIsAllowed(false);
          } else {
            setIsAllowed(true);
          }
        }
      } catch (err) {
        console.error(err);
        setMessage("❌ Unexpected error");
        setIsAllowed(false);
      }
    };

    checkAndLockFingerprint();
  }, [fingerprint, projectId]);

  const generateVoteLink = () => {
    if (!project || !fingerprint || !ip || !currentKey || !isAllowed) return "";

    const qrSecret = crypto
      .HmacSHA256(currentTimestamp.toString(), SECRET_KEY)
      .toString();

    const payload = JSON.stringify({
      project_id: projectId,
      timestamp: currentTimestamp, // Use the stored timestamp
      qrSecret,
      fingerprint,
      ip,
    });

    const encryptedPayload = crypto.AES.encrypt(payload, SECRET_KEY).toString();
    const encodedData = btoa(encryptedPayload)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    return `${BASE_URL}/vote?data=${encodedData}`;
  };

  if (loadingProjects) {
    return <div>Loading projects...</div>;
  }

  if (!project) {
    return <div>Project not found</div>;
  }

  return (
    <div className="project-vote-container">
      <h2>VOTERS: You can only vote for 1 PROJECT</h2>
      <h1>{project.name}</h1>
      {fingerprint && ip && currentKey && isAllowed !== null ? (
        isAllowed ? (
          <div className="qr-wrapper">
            {generateVoteLink() ? (
              <>
                <QRCodeSVG value={generateVoteLink()} size={200} />
                <p className="vote-instruction">
                  Scan QR to vote for {project.name}
                </p>
                <p className="info-text">QR refreshes every 10 seconds</p>
              </>
            ) : (
              <p className="loading-text">Generating QR...</p>
            )}
          </div>
        ) : (
          <p className="message">{message}</p>
        )
      ) : (
        <p className="loading-text">Loading...</p>
      )}
    </div>
  );
};

export default ProjectVote;
