const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const NotificationService = require('./notificationService');

class TaskService {
  // 1. Akıllı Görev Atama (Yorum satırı düzeltildi)
  static async assignSmart(data, user, finalInstitutionId, targetUsers) {
    const task = await prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        moduleType: data.moduleType || 'GENEL',
        status: 'BEKLIYOR',
        institutionId: finalInstitutionId,
        senderId: user.id,
        deadline: data.deadline ? new Date(data.deadline) : null
      }
    });

    if (targetUsers.length > 0) {
      const assignments = targetUsers.map(u => ({
        taskId: task.id,
        userId: u.id,
        status: 'BEKLIYOR'
      }));
      await prisma.taskAssignment.createMany({ data: assignments });

      // Hedef kullanıcılara bildirim at
      for (const u of targetUsers) {
        await NotificationService.createNotification(u.id, 'Yeni Görev Atandı', `${data.title} başlıklı yeni bir göreviniz var.`);
      }
    }
    return { task, userCount: targetUsers.length };
  }

  // 2. Kanıt Yükleme (Yorum satırı düzeltildi)
  static async uploadProof(assignmentId, userId, description, photoUrl) {
    const assignment = await prisma.taskAssignment.findUnique({
      where: { id: assignmentId },
      include: { task: true }
    });

    if (!assignment || assignment.userId !== userId) throw new Error('Bu görev size atanmamış.');

    const proof = await prisma.taskProof.create({
      data: {
        note: description || '',
        imageUrl: photoUrl || null,
        task: { connect: { id: assignment.taskId } },
        user: { connect: { id: userId } }
      }
    });

    await prisma.taskAssignment.update({
      where: { id: assignmentId },
      data: { status: 'ONAY_BEKLIYOR' }
    });

    // Görevi verene bildirim at
    if (assignment.task.senderId) {
      await NotificationService.createNotification(
        assignment.task.senderId, 
        'Görev Kanıtı Yüklendi', 
        `Bir personel '${assignment.task.title}' görevi için kanıt yükledi. Onayınızı bekliyor.`
      );
    }
    return proof;
  }
}

module.exports = TaskService;