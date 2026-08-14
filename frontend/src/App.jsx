import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const socket = io("https://talksy-backend-w3cv.onrender.com");

function getChatKey(user1, user2) {
  return [user1, user2].sort().join("_");
}

function App() {
  // ==========================================
  // LOGIN
  // ==========================================

  const [username, setUsername] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [password, setPassword] = useState("");

  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // ==========================================
  // PROFILE
  // ==========================================

  const [profilePicture, setProfilePicture] = useState("");
  const [uploadingProfilePicture, setUploadingProfilePicture] =
    useState(false);

  // ==========================================
  // USERS
  // ==========================================

  const [users, setUsers] = useState([]);

  // ==========================================
  // SELECTED USER
  // ==========================================

  const [selectedUser, setSelectedUser] = useState(null);

  // ==========================================
  // MESSAGE
  // ==========================================

  const [message, setMessage] = useState("");

  // ==========================================
  // MESSAGES
  // ==========================================

  const [messages, setMessages] = useState({});

  // ==========================================
  // UNREAD
  // ==========================================

  const [unreadCounts, setUnreadCounts] = useState({});

  // ==========================================
  // LAST MESSAGES
  // ==========================================

  const [lastMessages, setLastMessages] = useState({});

  // ==========================================
  // CHAT ORDER
  // ==========================================

  const [chatOrder, setChatOrder] = useState([]);

  // ==========================================
  // MEDIA
  // ==========================================

  const [selectedMedia, setSelectedMedia] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [sendingMedia, setSendingMedia] = useState(false);

  const fileInputRef = useRef(null);

  // ==========================================
  // CAMERA
  // ==========================================

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);

  const cameraVideoRef = useRef(null);
  const cameraCanvasRef = useRef(null);

  // ==========================================
  // SOCKET EVENTS
  // ==========================================

  useEffect(() => {
    const handleConnect = () => {
      console.log("Connected to server:", socket.id);
    };

    // ========================================
    // USERS LIST
    // ========================================

    const handleUsersList = (userList) => {
      setUsers(userList);
    };

    // ========================================
    // LOGIN SUCCESS
    // ========================================

    const handleLoginSuccess = (user) => {
      console.log("Login successful:", user);

      setUsername(user.username);
      setProfilePicture(user.profilePicture || "");

      setLoggingIn(false);
      setLoginError("");
    };

    // ========================================
    // LOGIN ERROR
    // ========================================

    const handleLoginError = (data) => {
      setLoggingIn(false);

      setLoginError(
        data?.message || "Login failed."
      );
    };

    // ========================================
    // PROFILE PICTURE UPDATED
    // ========================================

    const handleProfilePictureUpdated = (data) => {
      if (data.username === username) {
        setProfilePicture(
          data.profilePicture || ""
        );

        setUploadingProfilePicture(false);
      }

      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          user.username === data.username
            ? {
                ...user,
                profilePicture:
                  data.profilePicture || "",
              }
            : user
        )
      );
    };

    // ========================================
    // RECEIVE MESSAGE
    // ========================================

    const handleReceiveMessage = (data) => {
      const chatKey = getChatKey(
        data.sender,
        data.receiver
      );

      setMessages((prev) => ({
        ...prev,
        [chatKey]: [
          ...(prev[chatKey] || []),
          data,
        ],
      }));

      setLastMessages((prev) => ({
        ...prev,
        [chatKey]: data,
      }));

      setChatOrder((prev) => [
        chatKey,
        ...prev.filter(
          (key) => key !== chatKey
        ),
      ]);

      if (selectedUser !== data.sender) {
        setUnreadCounts((prev) => ({
          ...prev,
          [data.sender]:
            (prev[data.sender] || 0) + 1,
        }));
      }

      if (selectedUser === data.sender) {
        socket.emit(
          "mark_messages_seen",
          {
            sender: data.sender,
            receiver: username,
          }
        );
      }
    };

    // ========================================
    // MESSAGE SENT
    // ========================================

    const handleMessageSent = (data) => {
      const chatKey = getChatKey(
        data.sender,
        data.receiver
      );

      setMessages((prev) => ({
        ...prev,
        [chatKey]: [
          ...(prev[chatKey] || []),
          data,
        ],
      }));

      setLastMessages((prev) => ({
        ...prev,
        [chatKey]: data,
      }));

      setChatOrder((prev) => [
        chatKey,
        ...prev.filter(
          (key) => key !== chatKey
        ),
      ]);
    };

    // ========================================
    // CHAT HISTORY
    // ========================================

    const handleChatHistory = (history) => {
      if (!username || !selectedUser) {
        return;
      }

      const chatKey = getChatKey(
        username,
        selectedUser
      );

      setMessages((prev) => ({
        ...prev,
        [chatKey]: history,
      }));

      if (history.length > 0) {
        const lastMessage =
          history[history.length - 1];

        setLastMessages((prev) => ({
          ...prev,
          [chatKey]: lastMessage,
        }));

        setChatOrder((prev) => [
          chatKey,
          ...prev.filter(
            (key) => key !== chatKey
          ),
        ]);
      }
    };

    // ========================================
    // MESSAGES SEEN
    // ========================================

    const handleMessagesSeen = (data) => {
      const chatKey = getChatKey(
        data.sender,
        data.receiver
      );

      setMessages((prev) => ({
        ...prev,

        [chatKey]: (
          prev[chatKey] || []
        ).map((msg) => {
          if (
            msg.sender === data.sender &&
            msg.receiver === data.receiver
          ) {
            return {
              ...msg,
              seen: true,
            };
          }

          return msg;
        }),
      }));
    };

    // ========================================
    // DELETE MESSAGE
    // ========================================

    const handleMessageDeleted = (data) => {
      const messageId =
        data.messageId?.toString();

      setMessages((prev) => {
        const updated = { ...prev };

        Object.keys(updated).forEach(
          (key) => {
            updated[key] =
              updated[key].filter(
                (msg) =>
                  msg._id?.toString() !==
                  messageId
              );
          }
        );

        return updated;
      });

      setLastMessages((prev) => {
        const updated = { ...prev };

        Object.keys(updated).forEach(
          (key) => {
            if (
              updated[key]?._id?.toString() ===
              messageId
            ) {
              delete updated[key];
            }
          }
        );

        return updated;
      });
    };

    // ========================================
    // DELETE CHAT
    // ========================================

    const handleChatDeleted = (data) => {
      const chatKey = getChatKey(
        data.sender,
        data.receiver
      );

      setMessages((prev) => ({
        ...prev,
        [chatKey]: [],
      }));

      setLastMessages((prev) => {
        const updated = { ...prev };

        delete updated[chatKey];

        return updated;
      });

      setChatOrder((prev) =>
        prev.filter(
          (key) => key !== chatKey
        )
      );

      setUnreadCounts((prev) => {
        const updated = { ...prev };

        const otherUser =
          data.sender === username
            ? data.receiver
            : data.sender;

        delete updated[otherUser];

        return updated;
      });

      if (
        selectedUser === data.sender ||
        selectedUser === data.receiver
      ) {
        setSelectedUser(null);
      }
    };

    // ========================================
    // SOCKET LISTENERS
    // ========================================

    socket.on(
      "connect",
      handleConnect
    );

    socket.on(
      "users_list",
      handleUsersList
    );

    socket.on(
      "login_success",
      handleLoginSuccess
    );

    socket.on(
      "login_error",
      handleLoginError
    );

    socket.on(
      "profile_picture_updated",
      handleProfilePictureUpdated
    );

    socket.on(
      "receive_message",
      handleReceiveMessage
    );

    socket.on(
      "message_sent",
      handleMessageSent
    );

    socket.on(
      "chat_history",
      handleChatHistory
    );

    socket.on(
      "messages_seen",
      handleMessagesSeen
    );

    socket.on(
      "message_deleted",
      handleMessageDeleted
    );

    socket.on(
      "chat_deleted",
      handleChatDeleted
    );

    return () => {
      socket.off(
        "connect",
        handleConnect
      );

      socket.off(
        "users_list",
        handleUsersList
      );

      socket.off(
        "login_success",
        handleLoginSuccess
      );

      socket.off(
        "login_error",
        handleLoginError
      );

      socket.off(
        "profile_picture_updated",
        handleProfilePictureUpdated
      );

      socket.off(
        "receive_message",
        handleReceiveMessage
      );

      socket.off(
        "message_sent",
        handleMessageSent
      );

      socket.off(
        "chat_history",
        handleChatHistory
      );

      socket.off(
        "messages_seen",
        handleMessagesSeen
      );

      socket.off(
        "message_deleted",
        handleMessageDeleted
      );

      socket.off(
        "chat_deleted",
        handleChatDeleted
      );
    };
  }, [
    username,
    selectedUser,
  ]);

  // ==========================================
  // LOGIN
  // ==========================================

  const startChat = () => {
    const name = nameInput.trim();
    const pass = password.trim();

    if (!name || !pass) {
      setLoginError(
        "Enter username and password."
      );
      return;
    }

    setLoggingIn(true);
    setLoginError("");

    socket.emit("user_login", {
      username: name,
      password: pass,
    });
  };

  // ==========================================
  // PROFILE PHOTO
  // ==========================================

  const changeProfilePicture = async (event) => {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert(
        "Please select an image file."
      );

      event.target.value = "";
      return;
    }

    if (
      file.size >
      5 * 1024 * 1024
    ) {
      alert(
        "Profile photo must be less than 5 MB."
      );

      event.target.value = "";
      return;
    }

    try {
      setUploadingProfilePicture(true);

      const formData = new FormData();

      formData.append("file", file);

      const response = await fetch(
        "https://talksy-backend-w3cv.onrender.com/upload",
        {
          method: "POST",
          body: formData,
        }
      );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.message ||
            "Upload failed."
        );
      }

      const imageUrl =
        `https://talksy-backend-w3cv.onrender.com${data.mediaUrl}`;

      socket.emit(
        "update_profile_picture",
        {
          username,
          profilePicture: imageUrl,
        }
      );
    } catch (error) {
      console.error(error);

      setUploadingProfilePicture(false);

      alert(
        error.message ||
          "Could not change profile photo."
      );
    }

    event.target.value = "";
  };

  // ==========================================
  // MEDIA FILE SELECT
  // ==========================================

  const selectMedia = (event) => {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    if (
      !file.type.startsWith("image/") &&
      !file.type.startsWith("video/")
    ) {
      alert(
        "Only image and video files are allowed."
      );

      event.target.value = "";
      return;
    }

    if (
      file.size >
      50 * 1024 * 1024
    ) {
      alert(
        "File must be less than 50 MB."
      );

      event.target.value = "";
      return;
    }

    setSelectedMedia(file);

    setMediaPreview(
      URL.createObjectURL(file)
    );

    event.target.value = "";
  };

  // ==========================================
  // SEND MEDIA
  // ==========================================

  const sendMedia = async () => {
    if (
      !selectedMedia ||
      !selectedUser
    ) {
      return;
    }

    try {
      setSendingMedia(true);

      const formData =
        new FormData();

      formData.append(
        "file",
        selectedMedia
      );

      const response =
        await fetch(
          "https://talksy-backend-w3cv.onrender.com/upload",
          {
            method: "POST",
            body: formData,
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.message ||
            "Media upload failed."
        );
      }

      socket.emit(
        "send_media_message",
        {
          sender: username,
          receiver: selectedUser,
          mediaUrl:
            data.mediaUrl,
          mediaType:
            data.mediaType,
          message: "",
        }
      );

      closeMediaPreview();
    } catch (error) {
      console.error(error);

      alert(
        error.message ||
          "Media upload failed."
      );
    } finally {
      setSendingMedia(false);
    }
  };

  // ==========================================
  // CLOSE MEDIA PREVIEW
  // ==========================================

  const closeMediaPreview = () => {
    if (mediaPreview) {
      URL.revokeObjectURL(
        mediaPreview
      );
    }

    setSelectedMedia(null);
    setMediaPreview(null);
  };

  // ==========================================
  // CAMERA
  // ==========================================

  const openCamera = async () => {
    try {
      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            video: true,
            audio: false,
          }
        );

      setCameraStream(stream);
      setCameraOpen(true);

      setTimeout(() => {
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject =
            stream;
        }
      }, 100);
    } catch (error) {
      console.error(error);

      alert(
        "Camera permission was denied or camera is unavailable."
      );
    }
  };

  // ==========================================
  // CLOSE CAMERA
  // ==========================================

  const closeCamera = () => {
    if (cameraStream) {
      cameraStream
        .getTracks()
        .forEach((track) =>
          track.stop()
        );
    }

    setCameraStream(null);
    setCameraOpen(false);
  };

  // ==========================================
  // CAPTURE PHOTO
  // ==========================================

  const capturePhoto = () => {
    const video =
      cameraVideoRef.current;

    const canvas =
      cameraCanvasRef.current;

    if (!video || !canvas) {
      return;
    }

    canvas.width =
      video.videoWidth;

    canvas.height =
      video.videoHeight;

    const context =
      canvas.getContext("2d");

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          return;
        }

        const file =
          new File(
            [blob],
            `camera-${Date.now()}.jpg`,
            {
              type: "image/jpeg",
            }
          );

        closeCamera();

        setSelectedMedia(file);

        setMediaPreview(
          URL.createObjectURL(file)
        );
      },
      "image/jpeg",
      0.9
    );
  };

  // ==========================================
  // LOGOUT
  // ==========================================

  const logout = () => {
    socket.emit("user_logout");

    setUsername("");
    setPassword("");
    setNameInput("");

    setProfilePicture("");

    setSelectedUser(null);
    setMessage("");

    setMessages({});
    setLastMessages({});
    setChatOrder([]);
    setUnreadCounts({});
  };

  // ==========================================
  // OPEN CHAT
  // ==========================================

  const openChat = (user) => {
    const selectedUsername =
      user.username;

    setSelectedUser(
      selectedUsername
    );

    setUnreadCounts((prev) => ({
      ...prev,
      [selectedUsername]: 0,
    }));

    socket.emit(
      "get_messages",
      {
        sender: username,
        receiver:
          selectedUsername,
      }
    );

    socket.emit(
      "mark_messages_seen",
      {
        sender:
          selectedUsername,
        receiver: username,
      }
    );
  };

  // ==========================================
  // SEND TEXT MESSAGE
  // ==========================================

  const sendMessage = () => {
    const text =
      message.trim();

    if (
      !text ||
      !selectedUser
    ) {
      return;
    }

    socket.emit(
      "send_message",
      {
        sender: username,
        receiver:
          selectedUser,
        message: text,
      }
    );

    setMessage("");
  };

  // ==========================================
  // DELETE MESSAGE
  // ==========================================

  const deleteMessage = (
    messageId
  ) => {
    if (!messageId) {
      return;
    }

    const confirmDelete =
      window.confirm(
        "Delete this message?"
      );

    if (!confirmDelete) {
      return;
    }

    socket.emit(
      "delete_message",
      {
        messageId,
        sender: username,
      }
    );
  };

  // ==========================================
  // DELETE CHAT
  // ==========================================

  const deleteChat = () => {
    if (!selectedUser) {
      return;
    }

    const confirmDelete =
      window.confirm(
        `Delete complete chat with ${selectedUser}?`
      );

    if (!confirmDelete) {
      return;
    }

    socket.emit(
      "delete_chat",
      {
        sender: username,
        receiver:
          selectedUser,
      }
    );
  };

  // ==========================================
  // LOGIN SCREEN
  // ==========================================

  if (!username) {
    return (
      <div className="username-screen">
        <div className="username-box">

          <div className="login-logo">
            💬
          </div>

          <h1>Talksy</h1>

          <p>
            Login or create your
            Talksy account
          </p>

          <input
            type="text"
            placeholder="Username"
            value={nameInput}
            onChange={(e) =>
              setNameInput(
                e.target.value
              )
            }
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) =>
              setPassword(
                e.target.value
              )
            }
            onKeyDown={(e) => {
              if (
                e.key === "Enter"
              ) {
                startChat();
              }
            }}
          />

          {loginError && (
            <div className="login-error">
              {loginError}
            </div>
          )}

          <button
            onClick={startChat}
            disabled={loggingIn}
          >
            {loggingIn
              ? "Please wait..."
              : "➜ Login"}
          </button>

          <small className="login-note">
            New username = new account
          </small>

        </div>
      </div>
    );
  }

  // ==========================================
  // USERS
  // ==========================================

  const otherUsers =
    users.filter(
      (user) =>
        user.username !== username
    );

  const sortedUsers =
    [...otherUsers].sort(
      (a, b) => {
        const keyA =
          getChatKey(
            username,
            a.username
          );

        const keyB =
          getChatKey(
            username,
            b.username
          );

        const indexA =
          chatOrder.indexOf(keyA);

        const indexB =
          chatOrder.indexOf(keyB);

        if (
          indexA === -1 &&
          indexB !== -1
        ) {
          return 1;
        }

        if (
          indexA !== -1 &&
          indexB === -1
        ) {
          return -1;
        }

        if (
          indexA === -1 &&
          indexB === -1
        ) {
          return a.username.localeCompare(
            b.username
          );
        }

        return indexA - indexB;
      }
    );

  // ==========================================
  // CURRENT CHAT
  // ==========================================

  const currentChatKey =
    selectedUser
      ? getChatKey(
          username,
          selectedUser
        )
      : null;

  const currentMessages =
    currentChatKey
      ? messages[
          currentChatKey
        ] || []
      : [];

  // ==========================================
  // SELECTED USER
  // ==========================================

  const selectedUserObject =
    users.find(
      (user) =>
        user.username ===
        selectedUser
    );

  // ==========================================
  // UI
  // ==========================================

  return (
    <div className="app">

      <header className="header">
        <h1>💬 Talksy</h1>
      </header>

      <main className="chat-container">

        {/* SIDEBAR */}

        <aside className="sidebar">

          <h2>Chats</h2>

          <div className="users-list">

            {sortedUsers.map(
              (user) => {
                const chatKey =
                  getChatKey(
                    username,
                    user.username
                  );

                const lastMessage =
                  lastMessages[
                    chatKey
                  ];

                const unread =
                  unreadCounts[
                    user.username
                  ] || 0;

                return (
                  <div
                    key={user._id}
                    className={`chat-user ${
                      selectedUser ===
                      user.username
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      openChat(user)
                    }
                  >

                    <div className="avatar">

                      {user.profilePicture ? (
                        <img
                          src={
                            user.profilePicture?.startsWith("http")
                              ? user.profilePicture
                              : `https://talksy-backend-w3cv.onrender.com${user.profilePicture}`
                          }
                          alt={user.username}
                          className="profile-picture"
                        />
                      ) : (
                        user.username
                          .charAt(0)
                          .toUpperCase()
                      )}

                      {user.online && (
                        <span className="online-dot" />
                      )}

                    </div>

                    <div className="chat-user-info">

                      <div className="chat-user-top">

                        <h3>
                          {
                            user.username
                          }
                        </h3>

                        {lastMessage && (
                          <span className="last-time">
                            {
                              lastMessage.time
                            }
                          </span>
                        )}

                      </div>

                      <div className="chat-user-bottom">

                        <p>
                          {lastMessage
                            ? lastMessage.message ||
                              (lastMessage.messageType ===
                              "image"
                                ? "📷 Image"
                                : lastMessage.messageType ===
                                  "video"
                                ? "🎥 Video"
                                : "")
                            : user.online
                            ? "🔵 Online"
                            : "Offline"}
                        </p>

                        {unread >
                          0 && (
                          <span className="unread-count">
                            {unread >
                            99
                              ? "99+"
                              : unread}
                          </span>
                        )}

                      </div>

                    </div>

                  </div>
                );
              }
            )}

          </div>

          {sortedUsers.length ===
            0 && (
            <div className="no-users">

              <p>
                No other users
              </p>

              <small>
                Open another Talksy
                tab and login with
                another account.
              </small>

            </div>
          )}

          {/* MY PROFILE */}

          <div className="profile-bottom">

            <div className="my-profile">

              <div className="avatar my-avatar">

                {profilePicture ? (
                  <img
                    src={
                      profilePicture
                    }
                    alt={username}
                    className="profile-picture"
                  />
                ) : (
                  username
                    .charAt(0)
                    .toUpperCase()
                )}

                <span className="online-dot" />

              </div>

              <div className="profile-info">

                <h3>
                  {username}
                </h3>

                <p>
                  🔵 Online
                </p>

                <span className="profile-quote">
                  "Stay connected,
                  stay close 🤝."
                </span>

              </div>

              {/* PROFILE PHOTO BUTTON */}

              <label
                className="change-profile-button"
                title="Change profile photo"
              >
                📷

                <input
                  type="file"
                  accept="image/*"
                  onChange={
                    changeProfilePicture
                  }
                  disabled={
                    uploadingProfilePicture
                  }
                  hidden
                />
              </label>

            </div>

            <button
              className="logout-button"
              onClick={logout}
            >
              ⏻ Logout
            </button>

          </div>

        </aside>

        {/* CHAT WINDOW */}

        <section className="chat-window">

          {/* CHAT HEADER */}

          <div className="chat-header">

            {selectedUser ? (
              <>

                <div className="avatar">

                  {selectedUserObject?.profilePicture ? (
                    <img
                      src={
                        selectedUserObject.profilePicture
                      }
                      alt={
                        selectedUser
                      }
                      className="profile-picture"
                    />
                  ) : (
                    selectedUser
                      .charAt(0)
                      .toUpperCase()
                  )}

                  {selectedUserObject?.online && (
                    <span className="online-dot" />
                  )}

                </div>

                <div className="selected-user-info">

                  <h3>
                    {selectedUser}
                  </h3>

                  <p>
                    {selectedUserObject?.online
                      ? "🔵 Online"
                      : "Offline"}
                  </p>

                </div>

                <button
                  className="delete-chat-button"
                  onClick={
                    deleteChat
                  }
                  title="Delete complete chat"
                >
                  🗑️
                </button>

              </>
            ) : (
              <div className="empty-chat-header">

                <h3>
                  Welcome to Talksy
                </h3>

                <p>
                  Select a person to
                  start chatting
                </p>

              </div>
            )}

          </div>

          {/* MESSAGES */}

          <div className="messages">

            {currentMessages.length ===
              0 &&
              selectedUser && (
                <div className="empty-messages">

                  <div>
                    💬
                  </div>

                  <p>
                    No messages yet
                  </p>

                  <small>
                    Start the
                    conversation with{" "}
                    {selectedUser}
                  </small>

                </div>
              )}

            {currentMessages.map(
              (msg, index) => {

                const isSent =
                  msg.sender ===
                  username;

                return (
                  <div
                    key={
                      msg._id ||
                      index
                    }
                    className={`message-wrapper ${
                      isSent
                        ? "sent"
                        : "received"
                    }`}
                  >

                    <div
                      className={`message ${
                        isSent
                          ? "sent"
                          : "received"
                      }`}
                    >

                      {/* IMAGE */}

                      {msg.messageType ===
                        "image" && (
                        <img
                          src={`https://talksy-backend-w3cv.onrender.com${msg.mediaUrl}`}
                          alt="Shared"
                          className="chat-image"
                          onClick={() =>
                            window.open(
                              `https://talksy-backend-w3cv.onrender.com${msg.mediaUrl}`,
"_blank"
                            )
                          }
                        />
                      )}

                      {/* VIDEO */}

                      {msg.messageType ===
                        "video" && (
                        <video
                          src={`https://talksy-backend-w3cv.onrender.com${msg.mediaUrl}`}
                          controls
                          className="chat-video"
                        />
                      )}

                      {/* TEXT */}

                      {msg.message && (
                        <span className="message-text">
                          {
                            msg.message
                          }
                        </span>
                      )}

                      <span className="message-time">

                        {msg.time}

                        {isSent && (
                          <span className="message-status">

                            {msg.seen ? (
                              <span
                                className="seen"
                                title="Seen"
                              >
                                ✓✓
                              </span>
                            ) : (
                              <span
                                className="delivered"
                                title="Delivered"
                              >
                                ✓✓
                              </span>
                            )}

                          </span>
                        )}

                      </span>

                    </div>

                    {isSent && (
                      <button
                        className="delete-message-button"
                        onClick={() =>
                          deleteMessage(
                            msg._id
                          )
                        }
                        title="Delete message"
                      >
                        🗑 Delete
                      </button>
                    )}

                  </div>
                );
              }
            )}

          </div>

          {/* MEDIA PREVIEW */}

          {mediaPreview && (
            <div className="media-preview">

              <div className="media-preview-content">

                <button
                  className="media-preview-close"
                  onClick={
                    closeMediaPreview
                  }
                >
                  ✕
                </button>

                <h3>
                  Preview
                </h3>

                {selectedMedia?.type.startsWith(
                  "image/"
                ) ? (
                  <img
                    src={mediaPreview}
                    alt="Preview"
                  />
                ) : (
                  <video
                    src={mediaPreview}
                    controls
                  />
                )}

                <div className="media-preview-actions">

                  <button
                    className="cancel-media-button"
                    onClick={
                      closeMediaPreview
                    }
                    disabled={
                      sendingMedia
                    }
                  >
                    Cancel
                  </button>

                  <button
                    className="send-media-button"
                    onClick={sendMedia}
                    disabled={
                      sendingMedia
                    }
                  >
                    {sendingMedia
                      ? "Sending..."
                      : "Send"}
                  </button>

                </div>

              </div>

            </div>
          )}

          {/* MESSAGE INPUT */}

          {selectedUser && (
            <div className="message-input">

              {/* IMAGE / VIDEO */}

              <button
                className="media-button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                title="Image / Video"
              >
                🗂️
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={selectMedia}
                hidden
              />

              {/* CAMERA */}

              <button
                className="media-button"
                onClick={openCamera}
                title="Camera"
              >
                📷
              </button>

              {/* TEXT */}

              <input
                type="text"
                placeholder={`Message ${selectedUser}...`}
                value={message}
                onChange={(e) =>
                  setMessage(
                    e.target.value
                  )
                }
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter"
                  ) {
                    sendMessage();
                  }
                }}
              />

              <button
                onClick={sendMessage}
                title="Send message"
              >
                ➤
              </button>

            </div>
          )}

        </section>

      </main>

      {/* CAMERA MODAL */}

      {cameraOpen && (
        <div className="camera-modal">

          <div className="camera-box">

            <button
              className="camera-close"
              onClick={closeCamera}
            >
              ✕
            </button>

            <h3>
              Camera
            </h3>

            <video
              ref={cameraVideoRef}
              autoPlay
              playsInline
              className="camera-video"
            />

            <canvas
              ref={cameraCanvasRef}
              style={{
                display: "none",
              }}
            />

            <button
              className="capture-button"
              onClick={capturePhoto}
            >
              📸 Capture Photo
            </button>

          </div>

        </div>
      )}

    </div>
  );
}

export default App;