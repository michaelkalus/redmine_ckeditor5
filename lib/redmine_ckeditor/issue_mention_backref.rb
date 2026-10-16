# frozen_string_literal: true

module RedmineCkeditor
  module IssueMentionBackref
    PATTERN = /(?<![\w&])#(\d+)\b/
    MARKER = 'data-ckeditor-backref'

    module_function

    def enabled? = RedmineCkeditor.enabled? && RedmineCkeditorSetting.issue_mention_backref?

    def issue_ids(html) = HtmlMentionText.call(html).scan(PATTERN).flatten.map(&:to_i).uniq

    def from_journal(journal)
      return unless enabled?
      return unless journal.journalized.is_a?(Issue)
      return if journal.private_notes? || journal.notes.blank? || journal.notes.include?(MARKER)

      source = journal.journalized
      deliver(source: source, actor: journal.user, ids: issue_ids(journal.notes),
              key: "journal:#{journal.id}", href: "#{root}/issues/#{source.id}#change-#{journal.id}")
    end

    def from_issue(issue, previous_description)
      return unless enabled?
      return if issue.description.blank?

      ids = issue_ids(issue.description) - issue_ids(previous_description)
      actor = issue.current_journal&.user || (issue.previously_new_record? ? issue.author : nil)
      deliver(source: issue, actor: actor, ids: ids, key: "issue:#{issue.id}", href: "#{root}/issues/#{issue.id}")
    end

    def deliver(source:, actor:, ids:, key:, href:)
      return if ids.empty? || actor.nil? || source.is_private?

      Issue.where(id: ids - [source.id]).find_each do |target|
        next unless target.visible?(actor) && target.notes_addable?(actor)
        next if target.journals.where("#{Journal.table_name}.notes LIKE ?", "%#{MARKER}=\"#{key}\"%").exists?

        journal = Journal.new(journalized: target, user: actor, notes: note_html(source, key, href))
        journal.redmine_ckeditor_backref_marker = true
        journal.save!
      rescue StandardError => e
        Rails.logger.warn("redmine_ckeditor backref #{key} -> ##{target&.id}: #{e.class}: #{e.message}")
      end
    rescue StandardError => e
      Rails.logger.warn("redmine_ckeditor backref #{key}: #{e.class}: #{e.message}")
    end

    def note_html(source, key, href)
      label = ERB::Util.html_escape(::I18n.t(:ckeditor_issue_mentioned_in, locale: Setting.default_language))
      %(<p #{MARKER}="#{key}">#{label} <a href="#{ERB::Util.html_escape(href)}">##{source.id}</a></p>)
    end

    def root = Redmine::Utils.relative_url_root.to_s
  end
end
