import { FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../../config/db.js";
import { users } from "../../db/schema.js";
import { eq } from "drizzle-orm";

// Zod validation schemas
export const registerSchema = z.object({
  email: z.string().email("Format d'email invalide"),
  password: z.string().min(6, "Le mot de passe doit faire au moins 6 caractères"),
});

export const loginSchema = z.object({
  email: z.string().email("Format d'email invalide"),
  password: z.string(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export async function registerHandler(
  request: FastifyRequest<{ Body: RegisterInput }>,
  reply: FastifyReply
) {
  try {
    const { email, password } = registerSchema.parse(request.body);

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      return reply.status(409).send({
        error: "Conflict",
        message: "Cet email est déjà utilisé par un autre compte.",
      });
    }

    // Hasher le mot de passe (10 rounds de sel pour un bon équilibre perf/sécurité)
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insérer le nouvel utilisateur
    const [newUser] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
      })
      .returning({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt,
      });

    return reply.status(201).send(newUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Données de validation incorrectes",
        details: error.flatten().fieldErrors,
      });
    }
    
    request.log.error(error);
    return reply.status(500).send({
      error: "Internal Server Error",
      message: "Une erreur est survenue lors de la création du compte.",
    });
  }
}

export async function loginHandler(
  request: FastifyRequest<{ Body: LoginInput }>,
  reply: FastifyReply
) {
  try {
    const { email, password } = loginSchema.parse(request.body);

    // Récupérer l'utilisateur
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Email ou mot de passe incorrect.",
      });
    }

    // Vérifier le mot de passe
    const isPasswordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordMatch) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Email ou mot de passe incorrect.",
      });
    }

    // Générer le token JWT sécurisé
    // Le token expire dans 30 jours (pratique pour une PWA de santé)
    const token = request.server.jwt.sign(
      { id: user.id, email: user.email },
      { expiresIn: "30d" }
    );

    return reply.status(200).send({
      user: {
        id: user.id,
        email: user.email,
      },
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Données de validation incorrectes",
        details: error.flatten().fieldErrors,
      });
    }
    
    request.log.error(error);
    return reply.status(500).send({
      error: "Internal Server Error",
      message: "Une erreur est survenue lors de la connexion.",
    });
  }
}
