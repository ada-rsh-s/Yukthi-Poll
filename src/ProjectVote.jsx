// ... imports remain the same
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import crypto from "crypto-js";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { createClient } from "@supabase/supabase-js";
import { QRCodeSVG } from "qrcode.react";
import "./css/ProjectVote.css";

const SECRET_KEY = import.meta.env.VITE_SECRET_KEY;
const BASE_URL = "https://yukthipoll.netlify.app";

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
  const [currentTimestamp, setCurrentTimestamp] = useState(0);
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
        // Fetch all fingerprints for this project
        const { data: existingLinks, error: fetchError } = await supabase
          .from("project_links")
          .select("fingerprint")
          .eq("project_id", projectId);

        if (fetchError) {
          setMessage("❌ Error checking project lock: " + fetchError.message);
          setIsAllowed(false);
          return;
        }

        // Count unique fingerprints
        const uniqueFingerprints = existingLinks
          ? [...new Set(existingLinks.map((link) => link.fingerprint))]
          : [];
        const fingerprintCount = uniqueFingerprints.length;

        if (uniqueFingerprints.includes(fingerprint)) {
          // If this device is already linked, allow it
          setIsAllowed(true);
        } else if (fingerprintCount < 3) {
          // If less than 3 devices, add this one
          const { error: insertError } = await supabase
            .from("project_links")
            .insert([{ project_id: projectId, fingerprint }]);

          if (insertError) {
            setMessage("❌ Error locking project: " + insertError.message);
            setIsAllowed(false);
          } else {
            setIsAllowed(true);
          }
        } else {
          // If 3 devices are already linked, deny access
          setIsAllowed(false);
          setMessage("❌ This project link has reached its limit of 3 devices");
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
      timestamp: currentTimestamp,
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
      <p>THIS PROJECT LINK CAN BE OPENED ONLY UPTO MAX 3 DEVICES</p>
    </div>
  );
};

export default ProjectVote;
