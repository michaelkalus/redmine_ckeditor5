# frozen_string_literal: true

require_relative '../test_helper'

class RedmineCkeditorSettingTest < ActiveSupport::TestCase
  def test_converts_ckeditor_4_toolbar_names_and_separators
    Setting.stubs(:[]).with(:plugin_redmine_ckeditor).returns(
      'toolbar' => 'Source,ShowBlocks,--,Undo,Redo,-,Bold,Italic,/,JustifyCenter,JustifyRight,richImage,Table'
    )

    assert_equal(
      %w[sourceEditing showBlocks | undo redo | bold italic - alignment uploadImage insertFile insertTable],
      RedmineCkeditorSetting.toolbar
    )
  end

  def test_clamps_editor_height
    Setting.stubs(:[]).with(:plugin_redmine_ckeditor).returns('height' => '5000')

    assert_equal 1200, RedmineCkeditorSetting.height
  end

  def test_preserves_supported_legacy_display_settings
    Setting.stubs(:[]).with(:plugin_redmine_ckeditor).returns(
      'width' => '75%', 'ui_color' => '#abcdef', 'show_blocks' => '1', 'toolbar_can_collapse' => '1'
    )

    assert_equal '75%', RedmineCkeditorSetting.width
    assert_equal '#abcdef', RedmineCkeditorSetting.ui_color
    assert_predicate RedmineCkeditorSetting, :show_blocks?
    assert_predicate RedmineCkeditorSetting, :group_toolbar_items?
  end

  def test_feature_flags_default_to_enabled
    Setting.stubs(:[]).with(:plugin_redmine_ckeditor).returns({})

    assert_predicate RedmineCkeditorSetting, :user_mentions?
    assert_predicate RedmineCkeditorSetting, :issue_mentions?
    assert_predicate RedmineCkeditorSetting, :issue_mention_backref?
    assert_predicate RedmineCkeditorSetting, :file_uploads?
  end

  def test_feature_flags_can_be_disabled
    Setting.stubs(:[]).with(:plugin_redmine_ckeditor).returns(
      'user_mentions' => '0', 'issue_mentions' => '0', 'issue_mention_backref' => '0', 'file_uploads' => '0'
    )

    refute_predicate RedmineCkeditorSetting, :user_mentions?
    refute_predicate RedmineCkeditorSetting, :issue_mentions?
    refute_predicate RedmineCkeditorSetting, :issue_mention_backref?
    refute_predicate RedmineCkeditorSetting, :file_uploads?
  end

  def test_appends_insert_file_to_persisted_legacy_toolbar
    Setting.stubs(:[]).with(:plugin_redmine_ckeditor).returns('toolbar' => 'Bold,richImage,Table')

    assert_equal %w[bold uploadImage insertFile insertTable], RedmineCkeditorSetting.toolbar
  end

  def test_appends_insert_file_at_end_without_image_button
    Setting.stubs(:[]).with(:plugin_redmine_ckeditor).returns('toolbar' => 'Bold,Italic')

    assert_equal %w[bold italic | insertFile], RedmineCkeditorSetting.toolbar
  end

  def test_removes_insert_file_when_file_uploads_disabled
    Setting.stubs(:[]).with(:plugin_redmine_ckeditor).returns(
      'toolbar' => 'bold,insertFile,italic', 'file_uploads' => '0'
    )

    assert_equal %w[bold italic], RedmineCkeditorSetting.toolbar
  end

  def test_default_toolbar_contains_insert_file_once
    Setting.stubs(:[]).with(:plugin_redmine_ckeditor).returns({})

    assert_equal 1, RedmineCkeditorSetting.toolbar.count('insertFile')
    assert_equal RedmineCkeditorSetting.toolbar.index('uploadImage') + 1,
                 RedmineCkeditorSetting.toolbar.index('insertFile')
  end
end
