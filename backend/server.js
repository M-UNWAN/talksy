require("dotenv").config();

const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const User = require("./models/User");
const Message = require("./models/Message");

const app = express();

app.use(express.json());

app.use(
  require("cors")({
    origin: [
      "http://localhost:5173",
      "https://talksy-1-yb2j.onrender.com",
    ],
  })
);

const server = http.createServer(app);

// MULTER STORAGE
// ==========================================

const { CloudinaryStorage } = require("multer-storage-cloudinary");

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "talksy",
    resource_type: "auto",
  },
});

// ==========================================
// ALLOWED FILE TYPES
// ==========================================

const allowedMimeTypes = [
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",

  // Videos
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
];

const upload = multer({
  storage,

  limits: {
    fileSize: 50 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    if (
      allowedMimeTypes.includes(
        file.mimetype
      )
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Only image and video files are allowed."
        )
      );
    }
  },
});

// ==========================================
// FILE UPLOAD API
// ==========================================

app.post("/upload", (req, res) => {
  upload.single("file")(req, res, async (error) => {
    try {
      if (error) {
        console.error("Upload error:", error.message);

        return res.status(400).json({
          success: false,
          message: error.message || "File upload failed.",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file selected.",
        });
      }

      const mediaType = req.file.mimetype.startsWith("image/")
        ? "image"
        : "video";

      const mediaUrl = req.file.path;

      console.log("File uploaded:", mediaUrl);
      console.log("Cloudinary file data:", req.file);

      return res.json({
        success: true,
        mediaUrl,
        mediaType,

        cloudinaryPublicId:
          req.file.filename,

        cloudinaryResourceType:
          mediaType === "video"
            ? "video"
            : "image",

        originalName:
          req.file.originalname,

        mimeType:
          req.file.mimetype,

        size:
          req.file.size,
      });
      
    } catch (error) {
      console.error("Upload API error:", error);

      return res.status(500).json({
        success: false,
        message: "File upload failed.",
      });
    }
  });
});


// ==========================================
// DELETE FILE FROM CLOUDINARY
// ==========================================

async function deleteCloudinaryFile(
  publicId,
  resourceType
) {
  if (!publicId || !resourceType) {
    return;
  }

  try {
    const result =
      await cloudinary.uploader.destroy(
        publicId,
        {
          resource_type: resourceType,
          type: "upload",
          invalidate: true,
        }
      );

    console.log(
      "Cloudinary delete result:",
      result
    );
  } catch (error) {
    console.error(
      "Cloudinary delete error:",
      error
    );
  }
}

// ==========================================
// SOCKET.IO
// ==========================================

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "https://talksy-1-yb2j.onrender.com",
    ],
    methods: ["GET", "POST"],
  },
});

// ==========================================
// SEND USERS LIST
// ==========================================

async function sendUsersList() {
  try {
    const users =
      await User.find()
        .select(
          "username profilePicture online lastSeen"
        )
        .sort({
          username: 1,
        });

    io.emit(
      "users_list",
      users
    );
  } catch (error) {
    console.error(
      "Users list error:",
      error
    );
  }
}

// ==========================================
// SOCKET CONNECTION
// ==========================================

io.on(
  "connection",
  (socket) => {
    console.log(
      "Socket connected:",
      socket.id
    );

    // ========================================
    // LOGIN / CREATE ACCOUNT
    // ========================================

    socket.on(
      "user_login",
      async (data) => {
        try {
          const username =
            data?.username?.trim();

          const password =
            data?.password?.trim();

          if (
            !username ||
            !password
          ) {
            socket.emit(
              "login_error",
              {
                message:
                  "Enter username and password.",
              }
            );

            return;
          }

          if (
            mongoose.connection
              .readyState !== 1
          ) {
            socket.emit(
              "login_error",
              {
                message:
                  "MongoDB is not connected.",
              }
            );

            return;
          }

          // ==================================
          // FIND USER
          // ==================================

          let user =
            await User.findOne({
              username,
            });

          // ==================================
          // CREATE ACCOUNT
          // ==================================

          if (!user) {
            const hashedPassword =
              await bcrypt.hash(
                password,
                10
              );

            user =
              await User.create({
                username,
                password:
                  hashedPassword,
                online: true,
                lastSeen:
                  new Date(),
              });

            console.log(
              "New account created:",
              username
            );
          } else {
            // =================================
            // CHECK PASSWORD
            // =================================

            if (!user.password) {
              socket.emit(
                "login_error",
                {
                  message:
                    "This account has no password. Please create a new account.",
                }
              );

              return;
            }

            const passwordCorrect =
              await bcrypt.compare(
                password,
                user.password
              );

            if (
              !passwordCorrect
            ) {
              socket.emit(
                "login_error",
                {
                  message:
                    "Incorrect username or password.",
                }
              );

              return;
            }

            user.online =
              true;

            user.lastSeen =
              new Date();

            await user.save();

            console.log(
              "User logged in:",
              username
            );
          }

          socket.username =
            username;

          // ==================================
          // LOGIN SUCCESS
          // ==================================

          socket.emit(
            "login_success",
            {
              id: user._id,
              username:
                user.username,
              profilePicture:
                user.profilePicture,
              online:
                user.online,
            }
          );

          await sendUsersList();
        } catch (error) {
          console.error(
            "Login error:",
            error
          );

          socket.emit(
            "login_error",
            {
              message:
                "Something went wrong. Please try again.",
            }
          );
        }
      }
    );

    // ========================================
// UPDATE PROFILE PICTURE
// ========================================

socket.on(
  "update_profile_picture",
  async (data) => {
    try {
      const {
        username,
        profilePicture,
      } = data;

      if (
        !username ||
        !profilePicture
      ) {
        return;
      }

      // ==================================
      // UPDATE USER IN MONGODB
      // ==================================

      const user =
        await User.findOneAndUpdate(
          { username },
          {
            profilePicture,
          },
          { new: true }
        );

      if (!user) {
        socket.emit(
          "profile_picture_error",
          {
            message:
              "User not found.",
          }
        );

        return;
      }

      console.log(
        "Profile picture updated:",
        username
      );

      // ==================================
      // SEND UPDATE TO ALL USERS
      // ==================================

      io.emit(
        "profile_picture_updated",
        {
          username:
            user.username,

          profilePicture:
            user.profilePicture,
        }
      );

      // ==================================
      // STOP UPLOAD LOADING
      // ==================================

      socket.emit(
        "profile_picture_update_success",
        {
          profilePicture:
            user.profilePicture,
        }
      );

    } catch (error) {
      console.error(
        "Profile picture update error:",
        error
      );

      socket.emit(
        "profile_picture_error",
        {
          message:
            "Could not update profile picture.",
        }
      );
    }
  }
);

    // ========================================
    // LOGOUT
    // ========================================

    socket.on(
      "user_logout",
      async () => {
        try {
          if (
            !socket.username
          ) {
            return;
          }

          await User.findOneAndUpdate(
            {
              username:
                socket.username,
            },
            {
              online: false,
              lastSeen:
                new Date(),
            }
          );

          console.log(
            "User logged out:",
            socket.username
          );

          socket.username =
            null;

          await sendUsersList();
        } catch (error) {
          console.error(
            "Logout error:",
            error
          );
        }
      }
    );

    // ========================================
    // SEND TEXT MESSAGE
    // ========================================

    socket.on(
      "send_message",
      async (data) => {
        try {
          const {
            sender,
            receiver,
            message,
          } = data;

          if (
            !sender ||
            !receiver ||
            !message?.trim()
          ) {
            return;
          }

          const time =
            new Date().toLocaleTimeString(
              "en-IN",
              {
                timeZone: "Asia/Kolkata",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              }
            );

          const newMessage =
            await Message.create({
              sender,
              receiver,
              message:
                message.trim(),
              time,
              seen: false,
              messageType:
                "text",
              mediaUrl: "",
            });

          const messageData = {
            _id:
              newMessage._id,

            sender:
              newMessage.sender,

            receiver:
              newMessage.receiver,

            message:
              newMessage.message,

            time:
              newMessage.time,

            seen:
              newMessage.seen,

            messageType:
              newMessage.messageType,

            mediaUrl:
              newMessage.mediaUrl,

            cloudinaryPublicId:
              newMessage.cloudinaryPublicId,

            cloudinaryResourceType:
              newMessage.cloudinaryResourceType,
          };

          console.log(
            `Message saved: ${sender} -> ${receiver}`
          );

          // ==================================
          // FIND RECEIVER
          // ==================================

          const receiverSocket =
            [
              ...io.sockets.sockets.values(),
            ].find(
              (s) =>
                s.username ===
                receiver
            );

          // ==================================
          // SEND TO RECEIVER
          // ==================================

          if (
            receiverSocket
          ) {
            receiverSocket.emit(
              "receive_message",
              messageData
            );

            console.log(
              `Message delivered: ${sender} -> ${receiver}`
            );
          }

          // ==================================
          // SEND TO SENDER
          // ==================================

          socket.emit(
            "message_sent",
            {
              ...messageData,
              delivered:
                !!receiverSocket,
            }
          );
        } catch (error) {
          console.error(
            "Message error:",
            error
          );
        }
      }
    );

    // ========================================
    // SEND MEDIA MESSAGE
    // ========================================

    socket.on(
      "send_media_message",
      async (data) => {
        try {
          const {
            sender,
            receiver,
            mediaUrl,
            mediaType,
            cloudinaryPublicId,
            cloudinaryResourceType,
            message,
          } = data;

          if (
            !sender ||
            !receiver ||
            !mediaUrl ||
            !mediaType
          ) {
            return;
          }

          if (
            ![
              "image",
              "video",
            ].includes(
              mediaType
            )
          ) {
            return;
          }

          const time =
            new Date().toLocaleTimeString(
              "en-IN",
              {
                timeZone: "Asia/Kolkata",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              }
            );

          const newMessage =
            await Message.create({
              sender,
              receiver,

              message:
                message?.trim() ||
                "",

              time,

              seen: false,

              messageType:
                mediaType,

              mediaUrl,

              cloudinaryPublicId:
                cloudinaryPublicId || "",

              cloudinaryResourceType:
                cloudinaryResourceType || "",
            });

          const messageData = {
            _id:
              newMessage._id,
            sender:
              newMessage.sender,
            receiver:
              newMessage.receiver,
            message:
              newMessage.message,
            time:
              newMessage.time,
            seen:
              newMessage.seen,
            messageType:
              newMessage.messageType,
            mediaUrl:
              newMessage.mediaUrl,
          };

          console.log(
            `${mediaType} sent: ${sender} -> ${receiver}`
          );

          // ==================================
          // FIND RECEIVER
          // ==================================

          const receiverSocket =
            [
              ...io.sockets.sockets.values(),
            ].find(
              (s) =>
                s.username ===
                receiver
            );

          // ==================================
          // SEND TO RECEIVER
          // ==================================

          if (
            receiverSocket
          ) {
            receiverSocket.emit(
              "receive_message",
              messageData
            );
          }

          // ==================================
          // SEND TO SENDER
          // ==================================

          socket.emit(
            "message_sent",
            {
              ...messageData,
              delivered:
                !!receiverSocket,
            }
          );
        } catch (error) {
          console.error(
            "Media message error:",
            error
          );
        }
      }
    );

    // ========================================
    // GET CHAT HISTORY
    // ========================================

    socket.on(
      "get_messages",
      async (data) => {
        try {
          const {
            sender,
            receiver,
          } = data;

          if (
            !sender ||
            !receiver
          ) {
            return;
          }

          const messages =
            await Message.find({
              $or: [
                {
                  sender,
                  receiver,
                },
                {
                  sender: receiver,
                  receiver: sender,
                },
              ],
            }).sort({
              createdAt: 1,
            });

          socket.emit(
            "chat_history",
            messages
          );
        } catch (error) {
          console.error(
            "Chat history error:",
            error
          );
        }
      }
    );

    // ========================================
    // MARK MESSAGES AS SEEN
    // ========================================

    socket.on(
      "mark_messages_seen",
      async (data) => {
        try {
          const {
            sender,
            receiver,
          } = data;

          if (
            !sender ||
            !receiver
          ) {
            return;
          }

          await Message.updateMany(
            {
              sender,
              receiver,
              seen: false,
            },
            {
              $set: {
                seen: true,
              },
            }
          );

          // ==================================
          // TELL SENDER
          // ==================================

          const senderSocket =
            [
              ...io.sockets.sockets.values(),
            ].find(
              (s) =>
                s.username ===
                sender
            );

          if (
            senderSocket
          ) {
            senderSocket.emit(
              "messages_seen",
              {
                sender,
                receiver,
              }
            );
          }

          // ==================================
          // UPDATE CURRENT USER
          // ==================================

          const messages =
            await Message.find({
              $or: [
                {
                  sender,
                  receiver,
                },
                {
                  sender: receiver,
                  receiver: sender,
                },
              ],
            }).sort({
              createdAt: 1,
            });

          socket.emit(
            "chat_history",
            messages
          );
        } catch (error) {
          console.error(
            "Mark seen error:",
            error
          );
        }
      }
    );

    // ========================================
    // DELETE SINGLE MESSAGE
    // ========================================

    socket.on(
      "delete_message",
      async (data) => {
        try {
          console.log(
            "DELETE MESSAGE EVENT RECEIVED:",
            data
          );
          
          const {
            messageId,
            sender,
          } = data;

          if (
            !messageId ||
            !sender
          ) {
            return;
          }

          const message =
            await Message.findById(
              messageId
            );

          if (!message) {
            return;
          }

          // Only sender can delete
          if (
            message.sender !==
            sender
          ) {
            return;
          }

          // Delete media from Cloudinary
          console.log(
            "Cloudinary data:",
            message.cloudinaryPublicId,
            message.cloudinaryResourceType
          );

          if (
            message.cloudinaryPublicId &&
            message.cloudinaryResourceType
          ) {
            await deleteCloudinaryFile(
              message.cloudinaryPublicId,
              message.cloudinaryResourceType
            );
          }

          // Delete message from MongoDB
          await Message.findByIdAndDelete(
            messageId
          );

          const deleteData = {
            messageId:
              messageId.toString(),
          };

          // Send to sender
          socket.emit(
            "message_deleted",
            deleteData
          );

          // Send to receiver
          const receiverSocket =
            [
              ...io.sockets.sockets.values(),
            ].find(
              (s) =>
                s.username ===
                message.receiver
            );

          if (
            receiverSocket
          ) {
            receiverSocket.emit(
              "message_deleted",
              deleteData
            );
          }

          console.log(
            "Message deleted:",
            messageId
          );
        } catch (error) {
          console.error(
            "Delete message error:",
            error
          );
        }
      }
    );

    // ========================================
    // DELETE COMPLETE CHAT
    // ========================================

    socket.on(
      "delete_chat",
      async (data) => {
        try {
          const {
            sender,
            receiver,
          } = data;

          if (
            !sender ||
            !receiver
          ) {
            return;
          }

          const chatMessages =
            await Message.find({
              $or: [
                {
                  sender,
                  receiver,
                },
                {
                  sender: receiver,
                  receiver: sender,
                },
              ],
            });

            // Delete all media files from Cloudinary
            for (const message of chatMessages) {
              if (
                message.cloudinaryPublicId &&
                message.cloudinaryResourceType
              ) {
                await deleteCloudinaryFile(
                  message.cloudinaryPublicId,
                  message.cloudinaryResourceType
                );
              }
            }

          
          // ==================================
          // DELETE MESSAGES
          // ==================================

          await Message.deleteMany({
            $or: [
              {
                sender,
                receiver,
              },
              {
                sender: receiver,
                receiver: sender,
              },
            ],
          });

          const deleteData = {
            sender,
            receiver,
          };

          // Send to current user
          socket.emit(
            "chat_deleted",
            deleteData
          );

          // Send to receiver
          const receiverSocket =
            [
              ...io.sockets.sockets.values(),
            ].find(
              (s) =>
                s.username ===
                receiver
            );

          if (
            receiverSocket
          ) {
            receiverSocket.emit(
              "chat_deleted",
              deleteData
            );
          }

          console.log(
            `Chat deleted: ${sender} <-> ${receiver}`
          );
        } catch (error) {
          console.error(
            "Delete chat error:",
            error
          );
        }
      }
    );

    // ========================================
    // DISCONNECT
    // ========================================

    socket.on(
      "disconnect",
      async () => {
        console.log(
          "Socket disconnected:",
          socket.id
        );

        try {
          if (
            !socket.username
          ) {
            return;
          }

          const anotherSocket =
            [
              ...io.sockets.sockets.values(),
            ].find(
              (s) =>
                s.username ===
                socket.username
            );

          if (
            !anotherSocket
          ) {
            await User.findOneAndUpdate(
              {
                username:
                  socket.username,
              },
              {
                online: false,
                lastSeen:
                  new Date(),
              }
            );
          }

          await sendUsersList();
        } catch (error) {
          console.error(
            "Disconnect error:",
            error
          );
        }
      }
    );
  }
);

// ==========================================
// MULTER ERROR HANDLER
// ==========================================

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    if (
      error instanceof multer.MulterError
    ) {
      return res.status(400).json({
        success: false,
        message:
          error.message,
      });
    }

    next(error);
  }
);

// ==========================================
// MONGODB + SERVER
// ==========================================

const PORT = process.env.PORT || 5000;

mongoose
  .connect(
    process.env.MONGODB_URI
  )
  .then(() => {
    console.log(
      "MongoDB connected successfully"
    );

    server.listen(
      PORT,
      () => {
        console.log(
          `Talksy server running on http://localhost:${PORT}`
        );
      }
    );
  })
  .catch((error) => {
    console.error(
      "MongoDB connection failed:",
      error.message
    );
  });