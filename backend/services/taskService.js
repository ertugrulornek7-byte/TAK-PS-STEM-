const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const NotificationService = require('./notificationService');
const HierarchyService = require('./hierarchyService'); // 🔥 Onaylama yetkisi kontrolü için eklendi

class TaskService {
  // 1. Akıllı Görev Atama
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

  // 2. Kanıt Yükleme
  static async uploadProof(assignmentId, userId, description, photoUrl) {
    const assignment = await prisma.taskAssignment.findUnique({
      where: { id: assignmentId },
      include: { task: true }
    });

    if (!assignment || assignment.userId !== userId) {
      const e = new Error('Bu görev size atanmamış.');
      e.status = 403; // 🔥 DÜZELTME: önceden status set edilmiyordu, errorHandler bunu 500 olarak dönüyordu
      throw e;
    }

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

  // ==========================================
  // 3. 🔥 GERİ EKLENDİ: YÖNETİCİNİN GÖREVİ ONAYLAMASI
  // Bu metod, tasks.js TaskService'e taşınırken (bu oturumdan önceki commit'te)
  // kaybolmuştu. SayfaGorevler.vue hâlâ PUT /tasks/approve/:id çağırıyordu ama
  // backend'de böyle bir uç nokta kalmamıştı — "Onayla" butonu 404 veriyordu ve
  // görevler ONAY_BEKLIYOR durumunda sonsuza dek takılı kalıyordu.
  // ==========================================
  static async approveTask(assignmentId, approver) {
    const assignment = await prisma.taskAssignment.findUnique({
      where: { id: assignmentId },
      include: { task: true }
    });

    if (!assignment) {
      const e = new Error('Atama bulunamadı.');
      e.status = 404;
      throw e;
    }

    // Görevin bağlı olduğu kurum üzerinde yetkin var mı?
    // (Kuruma bağlı olmayan, bölge/mıntıka geneli görevlerde üst makamlara izin ver)
    if (assignment.task.institutionId) {
      const hasAccess = await HierarchyService.assertOwnsInstitution(approver, assignment.task.institutionId);
      if (!hasAccess) {
        const e = new Error('Bu görevi onaylama yetkiniz yok.');
        e.status = 403;
        throw e;
      }
    } else if (!['SISTEM', 'BOLGE', 'MINTIKA'].includes(approver.roleLevel)) {
      const e = new Error('Bu görevi onaylama yetkiniz yok.');
      e.status = 403;
      throw e;
    }

    if (assignment.status !== 'ONAY_BEKLIYOR') {
      const e = new Error('Bu görev henüz onay için gönderilmemiş.');
      e.status = 400;
      throw e;
    }

    const updated = await prisma.taskAssignment.update({
      where: { id: assignmentId },
      data: { status: 'TAMAMLANDI', isCompleted: true, completedAt: new Date() }
    });

    if (assignment.userId) {
      await NotificationService.createNotification(
        assignment.userId,
        'Göreviniz Onaylandı',
        `'${assignment.task.title}' göreviniz onaylandı, tebrikler!`
      );
    }

    return updated;
  }
}

module.exports = TaskService;