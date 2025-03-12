import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import crypto from "crypto-js";
import { createClient } from "@supabase/supabase-js";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import "./css/Voted.css"; 

const SECRET_KEY = import.meta.env.VITE_SECRET_KEY;
const VALIDITY_WINDOW = import.meta.env.VALIDITY_WINDOW; 
const MAX_VOTES = import.meta.env.VITE_MAX_VOTES; 

const supabase = createClient(
  import.meta.env.VITE_SUPA_URL,
  import.meta.env.VITE_SUPA_KEY
);


const Voted = () => {
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [ip, setIp] = useState("");
  const [projectName, setProjectName] = useState("");

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

  // Handle vote parsing and validation
  useEffect(() => {
    if (!fingerprint || !ip) return; // Wait for fingerprint and IP

    const encodedData = searchParams.get("data");
    console.log(encodedData);

    if (!encodedData) {
      setMessage("❌ No vote data provided");
      return;
    }

    const handleVote = async () => {
      try {
        // Decode URL-safe base64
        const encryptedPayload = atob(
          encodedData.replace(/-/g, "+").replace(/_/g, "/")
        );

        // Decrypt the payload
        const decryptedBytes = crypto.AES.decrypt(encryptedPayload, SECRET_KEY);
        const decryptedPayload = decryptedBytes.toString(crypto.enc.Utf8);

        if (!decryptedPayload) {
          setMessage("❌ Invalid or corrupted vote data");
          return;
        }

        const { project_id, timestamp, qrSecret } =
          JSON.parse(decryptedPayload);
        const currentTimestamp = Math.floor(Date.now() / 10000); // 10 seconds

        // Validate qrSecret
        const expectedKey = crypto
          .HmacSHA256(timestamp.toString(), SECRET_KEY)
          .toString();

        if (qrSecret !== expectedKey) {
          setMessage("❌ Vote failed: Invalid QR code");
          return;
        }

        // Check timestamp validity (30 seconds window)
        if (
          currentTimestamp - timestamp > VALIDITY_WINDOW ||
          currentTimestamp < timestamp
        ) {
          setMessage(
            "🕵️‍♀️ QR code expired...Try scanning the latest QR again!"
          );
          return;
        }

        // Fetch project name from teams table
        const { data: projectData, error: projectError } = await supabase
          .from("teams")
          .select("project_title")
          .eq("id", project_id)
          .single();

        if (projectError || !projectData) {
          setMessage("❌ Error fetching project details");
          return;
        }

        setProjectName(projectData.project_title);

        // Check if this viewer has already voted for any project
        const { data: votes } = await supabase
          .from("projects")
          .select("*")
          .eq("fingerprint", fingerprint);

        if (votes && votes.length >= MAX_VOTES) {
          setMessage(`❌ Vote failed: You have already voted for a project`);
          return;
        }

        // Insert the vote into Supabase
        const { error } = await supabase.from("projects").insert([
          {
            project_id,
            timestamp: Date.now(),
            fingerprint,
            ip,
          },
        ]);

        if (error) {
          setMessage("❌ Vote failed: " + error.message);
        } else {
          setMessage(
            `✅ Vote recorded successfully for ${projectData.project_title}`
          );
        }
      } catch (err) {
        console.error(err);
        setMessage("❌ Error processing vote");
      }
    };

    handleVote();
  }, [fingerprint, ip, searchParams]);

  return (
    <div className="voted-container">
      <h1>Vote Processing</h1>
      {message ? (
        <p className="vote-message">{message}</p>
      ) : (
        <p className="loading-text">Processing your vote...</p>
      )}
    </div>
  );
};

export default Voted;
